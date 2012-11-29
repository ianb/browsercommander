function Connection(address) {
  if (! address) {
    address = "ws";
    if (location.protocol == "https") {
      address += "s";
    }
    address += "://" + location.host;
  }
  this.address = address;
  this.exports = {};
  this.connect();
  this._id = 1;
  this._callbacks = {};
}

Connection.prototype = {
  connect: function () {
    this.socket = new WebSocket(this.address);
    this.socket.onopen = (function () {
      console.info("Socket opened");
      this.emit("socketopen", this.socket);
    }).bind(this);
    this.socket.onclose = (function () {
      // FIXME: this can create a ton of messages:
      console.info("Socket closed");
      this.socket = null;
      this.connect();
    }).bind(this);
    this.socket.onmessage = (function (event) {
      var msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        console.warn("Bad JSON:", JSON.stringify(event.data));
        throw e;
      }
      this.onmessage(msg);
    }).bind(this);
    this.socket.onerror = (function (event) {
      console.error("WebSocket error:", event.data);
      this.emit("socketerror", event, this.socket);
    }).bind(this);
  },

  makeId: function () {
    return this._id++;
  },

  onmessage: function (msg) {
    if (msg.id == "intro") {
      this.methods = msg.methods;
      this.env = msg.env;
      this.constructMethods();
      this.emit("open", this);
      return;
    }
    if (! this._callbacks[msg.id]) {
      console.warn("Got a message with no destination:", msg);
      return;
    }
    var callback = this._callbacks[msg.id];
    callback(msg);
  },

  register: function (id, callback) {
    this._callbacks[id] = callback;
  },

  unregister: function (id) {
    delete this._callbacks[id];
  },

  send: function (msg) {
    if (typeof msg != "string") {
      msg = JSON.stringify(msg);
    }
    this.socket.send(msg);
  },

  constructMethods: function () {
    var names = this.methods;
    for (var i=0; i<names.length; i++) {
      var name = names[i].split(".");
      var base = this.exports;
      for (var j=0; j<name.length-1; j++) {
        base = base[name[j]] = base[name[j]] || {};
      }
      base[name[name.length-1]] = makeCallback(names[i], this);
    }
    this.exports.child_process.spawn = spawnerFactory(this);
  }

};

MixinEvents(Connection.prototype);

function makeCallback(name, connection) {
  var func = function () {
    var callback = arguments[arguments.length - 1];
    var args = [];
    for (var i=0; i<arguments.length-1; i++) {
      args.push(arguments[i]);
    }
    var id = connection.makeId();
    connection.register(id, function (result) {
      callback.apply(null, result.result);
      if (result.done) {
        connection.unregister(id);
      }
    });
    connection.send({
      id: id,
      type: name,
      data: args
    });
  };
  func.name = name;
  return func;
}

function spawnerFactory(connection) {
  var func = function spawn(command, args, options) {
    if (! command) {
      throw "You must provide a command";
    }
    if (args && ! Array.isArray(args)) {
      throw "Arguments must be an array";
    }
    var id = connection.makeId();
    var msg = {
      id: id,
      type: "child_process.spawn",
      data: [command, args, options]
    };
    var child = new Child(connection, id);
    connection.register(id, child._message.bind(child));
    connection.send(msg);
    return child;
  };
  return func;
}

function Child(connection, id) {
  this._connection = connection;
  this._id = id;
  this.stderr = new Stream(this, "stderr");
  this.stdout = new Stream(this, "stdout");
  this.stderr = new Stream(this, "stderr");
  this._listeners = {};
}

Child.prototype = {
  _message: function (msg) {
    if (msg.result.event == "stdout.data") {
      this.stdout.emit("data", msg.result.args[0]);
    } else if (msg.result.event == "stderr.data") {
      this.stderr.emit("data", msg.result.args[0]);
    } else {
      if (msg.result.event == "open") {
        this.pid = msg.result.pid;
      }
      var args = [msg.result.event].concat(msg.result.args);
      this.emit.apply(this, args);
    }
  },

  kill: function (signal) {
    var msg = {
      id: this._id,
      type: "kill",
      data: signal
    };
    this._connection.send(msg);
  },

  write: function (name, s) {
    var msg = {
      id: this._id,
      type: "write",
      data: s
    };
    this._connection.send(msg);
  },

  finish: function (callback) {
    var stdout = "";
    var stderr = "";
    this.stdout.on("data", function (s) {
      stdout += s;
    });
    this.stderr.on("data", function (s) {
      stderr += s;
    });
    this.on("exit", function (code) {
      callback(stdout, stderr, code);
    });
  }

};

MixinEvents(Child.prototype);

function Stream(child, name) {
  this._child = child;
  this._name = name;
  this._dataCallbacks = [];
}

Stream.prototype = {
  write: function (s) {
    this._child.write(this._name, s);
  }
};

MixinEvents(Stream.prototype);

function log(name) {
  name = name || 'result';
  return function () {
    var args = [name + ':'];
    for (var i=0; i<arguments.length; i++) {
      args.push(arguments[i]);
    }
    console.log.apply(console, args);
  };
}
