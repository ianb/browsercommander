var WebSocketServer = require('websocket').server;
var WebSocketRouter = require('websocket').router;
var http = require('http');
var https = require('https');
var static = require('node-static');
var parseUrl = require('url').parse;
var fs = require('fs');
var os = require('os');
var path = require('path');
var child_process = require('child_process');
var path_join = require("path").join;

var staticRoot = new static.Server(__dirname + "/static");
var globalRoot = new static.Server("/");

var server = http.createServer(function (request, response) {
  var url = parseUrl(request.url, true);
  if (url.pathname == "/serve") {
    var path = url.query.filename;
    globalRoot.serveFile(path, 200, {}, request, response);
    return;
  }
  request.addListener("end", function () {
    staticRoot.serve(request, response);
  });
});

var wsServer = new WebSocketServer({
  httpServer: server,
  // 10Mb max size (1Mb is default, maybe unnecessary)
  maxReceivedMessageSize: 0x1000000,
  // The browser doesn't seem to break things up into frames (not sure what this means)
  // and the default of 64Kb was exceeded; raised to 1Mb
  maxReceivedFrameSize: 0x100000,
  // Using autoaccept because the origin is somewhat dynamic
  // (but maybe is not anymore)
  // FIXME: make this fixed
  autoAcceptConnections: false
});

function originIsAllowed(origin) {
  // Unfortunately the origin will be whatever page you are sharing, which is
  // any possible origin.
  return true;
}

wsServer.on("request", function (request) {
  if (! originIsAllowed(request.origin)) {
    request.reject();
    return;
  }
  var connection = request.accept(null, request.origin);
  connection.pendingHandlers = {};
  connection.on("message", function (message) {
    var parsed = JSON.parse(message.utf8Data);
    if (parsed.id in connection.pendingHandlers) {
      connection.pendingHandlers[parsed.id](parsed);
      return;
    }
    var more = Handlers[parsed.type](connection, parsed, function () {
      delete connection.pendingHandlers[parsed.id];
    });
    if (more) {
      connection.pendingHandlers[parsed.id] = more;
    }
  });
  var intro = {
    id: "intro",
    methods: Object.keys(Handlers),
    env: process.env
  };
  connection.send(JSON.stringify(intro));
});

var Handlers = {};

function enumerateModule(module, moduleName, names, wrapper) {
  wrapper = wrapper || Simple;
  if (typeof names == "string") {
    names = names.split(/\s+/);
  }
  for (var i=0; i<names.length; i++) {
    var name = names[i];
    if (! name) {
      continue;
    }
    var propName = moduleName + "." + name;
    Handlers[propName] = wrapper(module[name], module);
  }
}

enumerateModule(
  fs, "fs",
  "rename truncate chown fchown lchown chmod fchmod lchmod stat lstat fstat link symlink " +
  "readlink realpath unlink rmdir mkdir readdir utimes readFile writeFile appendFile " +
  "exists"
  );

enumerateModule(
  os, "os",
  "tmpDir hostname type platform arch release uptime loadavg totalmem freemem cpus " +
  "networkInterfaces",
  SimpleSync
  );

enumerateModule(
  path, "path",
  "resolve sep",
  SimpleSync
  );

enumerateModule(
  console, "console",
  "log info error warn time timeEnd",
  SimpleSync
  );

enumerateModule(
  process, "process",
  "abort cwd exit getgid setgid getuid setuid kill memoryUsage umask uptime hrtime",
  SimpleSync
  );

enumerateModule(
  process, "process",
  "env version config pid title arch platform ",
  Returner
  );

Handlers["child_process.spawn"] = function (connection, msg, finisher) {
  var command = msg.data[0];
  var args = msg.data[1] || [];
  var options = msg.data[2] || {};
  options.stdio = "pipe";
  var stdin = options.stdin;
  if (options.stdin) {
    delete options.stdin;
  }
  console.log("Spawning:");
  console.log("  ", command, args, options);
  if (! command) {
    connection.send(JSON.stringify({
      id: msg.id,
      done: true,
      result: {
        event: "exit",
        code: -1,
        message: "Bad/empty command"
      }
    }));
    return null;
  }
  var proc = child_process.spawn(command, args, options);
  function listener(eventName, also) {
    return function () {
      var args = [];
      for (var i=0; i<arguments.length; i++) {
        args.push(arguments[i]);
      }
      var resultMsg = {
        id: msg.id,
        result: {
          event: eventName,
          args: args
        }
      };
      connection.send(JSON.stringify(resultMsg));
      if (also) {
        also();
      }
    };
  }
  proc.stdout.setEncoding("utf8");
  proc.stdin.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  proc.on("exit", listener("exit", function () {
    finisher();
  }));
  proc.stdout.on("data", listener("stdout.data"));
  proc.stderr.on("data", listener("stderr.data"));
  proc.on("close", listener("close"));
  var resultMsg = {
    id: msg.id,
    result: {
      event: "open",
      pid: proc.pid
    }
  };
  connection.send(JSON.stringify(resultMsg));
  return function (nextMessage) {
    if (nextMessage.type == "write") {
      proc.stdin.write(nextMessage.data);
    } else if (nextMessage.type == "kill") {
      proc.kill(nextMessage.data);
    }
  };
};

Handlers["fs.statdir"] = Simple(function (path, callback) {
  fs.readdir(path, function (error, files) {
    if (error) {
      callback(error);
      return;
    }
    var result = {};
    if (! files.length) {
      callback(null, result);
      return;
    }
    var total = files.length;
    files.forEach(function (name) {
      fs.stat(path_join(path, name), function (error, stat) {
        if (error) {
          result[name] = {error: error};
        } else {
          result[name] = statToJson(stat);
        }
        total--;
        if (! total) {
          callback(null, result);
        }
      });
    });
  });
});

function statToJson(stat) {
  stat.atime = stat.atime && stat.atime.getTime();
  stat.mtime = stat.atime && stat.mtime.getTime();
  stat.ctime = stat.ctime && stat.ctime.getTime();
  stat.isFile = stat.isFile();
  stat.isDirectory = stat.isDirectory();
  stat.isBlockDevice = stat.isBlockDevice();
  stat.isCharacterDevice = stat.isCharacterDevice();
  stat.isSymbolicLink = stat.isSymbolicLink();
  stat.isFIFO = stat.isFIFO();
  stat.isSocket = stat.isSocket();
  return stat;
}

function Simple(func, context) {
  context = context || null;
  return function (connection, msg) {
    var args = [msg.data];
    if (Array.isArray(msg.data)) {
      args = msg.data;
    }
    args.push(function () {
      var result = [];
      for (var i=0; i<arguments.length; i++) {
        result.push(arguments[i]);
      }
      console.log('sending back', msg.id, args);
      var resultMsg = {
        id: msg.id,
        done: true,
        result: result
      };
      connection.send(JSON.stringify(resultMsg));
    });
    func.apply(context, args);
  };
}

function SimpleSync(func, context) {
  context = context || null;
  return function (connection, msg) {
    var args = [msg.data];
    if (Array.isArray(msg.data)) {
      args = msg.data;
    }
    var result = func.apply(context, args);
    var resultMsg = {
      id: msg.id,
      done: true,
      result: result
    };
    connection.send(JSON.stringify(resultMsg));
  };
}

function Returner(value) {
  return function (connection, msg) {
    var resultMsg = {
      id: msg.id,
      done: true,
      result: value
    };
    connection.send(JSON.stringify(resultMsg));
  };
}

server.listen(8080);
