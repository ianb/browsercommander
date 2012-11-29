function Console(pane, el) {
  this.pane = pane;
  this.el = el;
  $('input.input', this.el).bind('keyup', this.inputKeyup.bind(this));
  var self = this;
  this.homeCache = {};
  this.history = [];
  this.historySearch = null;
  this.historyPos = null;
  this.persister = new Persister();
  this.persistId = null;
  this.persistRestored = false;
  if (! Object.keys(this.env()).length) {
    console.log('No environment, loading...');
    if (connection.env && Object.keys(connection.env).length) {
      this.env(connection.env);
      if (this.cwd() == "~") {
        this.cwd(connection.env.HOME);
      }
    } else {
      var method = (function () {
        this.env(connection.env);
          if (this.cwd() == "~") {
          this.cwd(connection.env.HOME);
        }
        connection.removeListener("open", method);
      }).bind(this);
      connection.on("open", method);
    }
  }
  this.el.on("click", ".collapsed-status", function () {
    var container = $(this).closest(".collapsed-history");
    container.find(".collapsed-content").toggle();
    self.paneChange();
  });
  this.el.find(".env-control").click(function () {
    self.envHidden(! self.envHidden());
  });
  this.envHidden(true);
  // FIXME: can't figure out CSS to get right width:
  this.el.find("input.input").width(this.el.width() - 15);
  this.pane.on("expand", (function () {
    this.focus();
  }).bind(this));
  this.on("cwdchange", (function (cwd) {
    var home = this.env("HOME");
    cwd = cwd.replace(home, "~");
    this.pane.title().text("Shell: " + cwd);
  }).bind(this));
  this.pane.controller = this;
}

Console.create = function (pane) {
  var outer = $('<div class="interaction"></div>');
  var meta = $('<div class="meta">' +
    '<div class="cwd-container">dir: <span class="cwd">~</span></div>' +
    '<div class="envs-container">envs<span class="env-control">-</span>: <span class="envs"></span></div>' +
    '</div>');
  var console = $('<div class="interactive">' +
    '<div class="output">' +
      '<div class="output-inner"></div>' +
    '</div>' +
    '<input type="text" class="input">' +
  '</div>');
  outer.append(meta);
  outer.append(console);
  pane.append(outer);
  return new Console(pane, outer);
};

Console.prototype = {

  persistSoon: function(time) {
    time = time || 1000;
    if (this.persistId) {
      this.saverId = setTimeout((function() {
        this.persist();
      }).bind(this), time);
    }
  },

  paneChange: function () {
    this.el.find("input.input")[0].scrollIntoView();
  },

  focus: function() {
    return $('input.input', this.el).focus();
  },

  write: function(output, type, id) {
    type = type || 'stdout';
    var el = $('<span>');
    el.addClass(type);
    var ANSI_CLEAR = '\x1b[H\x1b[2J';
    if (output.indexOf(ANSI_CLEAR) != -1) {
      // The output contains an ANSI clear sequence
      this.clear();
      output = output.substr(output.indexOf(ANSI_CLEAR) + ANSI_CLEAR.length);
    }
    output = output.replace(/&/g, '&amp;');
    output = output.replace(/</g, '&lt;');
    // Mini-ANSI:
    output = output.replace(/([\x20-\xff])\x08\1/g, function (m) {
      return '<b>' + m.charAt(0) + '</b>';
    });
    output = output.replace(/_\x08[\x20-\xff]/g, function (m) {
      return '<i>' + m.charAt(2) + '</i>';
    });
    output = quoteLower(output);
    el.html(output);
    return this.writeEl(el, id);
  },

  writeEl: function(el, id) {
    var container;
    if (id) {
      container = $('#' + id, this.el);
    } else {
      container = $('.output-inner', this.el);
    }
    if (! container.length) {
      throw 'Could not get element #' + id;
    }
    container.append(el);
    this.paneChange();
    this.persistSoon();
  },

  clear: function () {
    var container = $('.output-inner', this.el);
    // FIXME: do something more clever than empty; like collapse?
    var newContainer = $('<div class="collapsed-history"><div class="collapsed-status"></div><div class="collapsed-content" style="display: none"></div></div>');
    var inner = newContainer.find('.collapsed-content');
    newContainer.find('.collapsed-status').text(new Date());
    var children = container[0].childNodes;
    while (children.length) {
      inner.append(children[0]);
    }
    container.prepend(newContainer);
    this.paneChange();
    this.persistSoon();
  },

  cwd: function(dir) {
    var cwdEl, els, newEl;
    if (dir !== null && dir !== undefined) {
      dir = normpath(pathjoin(this.cwd(), dir));
      els = $('.meta .cwd', this.el);
      if (!els.length) {
        newEl = $('<div>cwd: <span class="cwd"></span></div>');
        $('.meta', this.el).append(newEl);
        cwdEl = $('.cwd', newEl)[0];
      } else {
        cwdEl = els[els.length - 1];
      }
      $(cwdEl).text(dir);
      this.emit("cwdchange", dir);
      this.persist();
      return dir;
    } else {
      els = $('.meta .cwd', this.el);
      if (!els.length) {
        return '/';
      }
      return $(els[els.length - 1]).text();
   }
  },

  envHidden: function (value) {
    var envs = this.el.find(".envs");
    var controls = this.el.find(".env-control");
    if (value === undefined) {
      return envs.is(":hidden");
    }
    if (value) {
      envs.hide();
      controls.text("+");
    } else {
      envs.show();
      controls.text("-");
    }
    return value;
  },

  env: function(name, value) {
    if (typeof name === 'object') {
      $('.meta .envs .setting').remove();
      for (var setName in name) {
        if (! name.hasOwnProperty(setName)) {
          continue;
        }
        value = name[setName];
        this._setEnv(setName, value);
      }
      return name;
    } else if (value !== undefined) {
      this._setEnv(name, value);
      return name;
    } else {
      return this._getEnv(name);
    }
  },

  _setEnv: function (name, value) {
    var _i, _len, _j, _len2;
    var els = $('.meta .envs .setting', this.el);
    if (value === null) {
      for (_i = 0, _len = els.length; _i < _len; _i++) {
        var el = els[_i];
        if ($('.name', el).text() === name) {
          el.remove();
          return;
        }
      }
    } else {
      for (_j = 0, _len2 = els.length; _j < _len2; _j++) {
        el = els[_j];
        if ($('.name', el).text() === name) {
          $('.value', el).text(value);
          return;
        }
      }
      var parent = $('.meta .envs');
      var v = $('<span class="setting"><span class="name"></span>=<span class="value"></span></span>');
      $('.name', v).text(name);
      $('.value', v).text(value);
      parent.append(v);
    }
    this.persist();
  },

  _getEnv: function (name) {
    var _k, _len3;
    var els = $('.meta .envs .setting', this.el);
    var result = {};
    for (_k = 0, _len3 = els.length; _k < _len3; _k++) {
      var el = els[_k];
      var n = $('.name', el).text();
      var v = $('.value', el).text();
      result[n] = v;
    }
    if (name != null) {
      return result[name];
    }
    return result;
  },

  inputKeyup: function(event) {
    var inputEl;
    if (event.type !== 'keyup') {
      return;
    }
    if (event.which === 13) {
      this.runInputCommand();
      return false;
    }
    if (event.which === 38) {
      if (!(this.historyPos != null)) {
        this.historyPos = this.history.length;
      }
      this.historyPos--;
      if (this.historyPos < 0) {
        this.historyPos = 0;
      }
      inputEl = $('input.input', this.el);
      inputEl.val(this.history[this.historyPos]);
      return false;
    }
    if (event.which === 40) {
      if (!(this.historyPos != null)) {
        return false;
      }
      this.historyPos++;
      if (this.historyPos > this.history.length) {
        this.historyPos = this.history.length;
      }
      inputEl = $('input.input', this.el);
      inputEl.val(this.history[this.historyPos]);
      return false;
    }
    if (event.which === 82 && event.altKey) {
      return false;
    }
  },

  runInputCommand: function() {
    var inputEl = $('input.input', this.el);
    var input = inputEl.val();
    this.history.push(input);
    this.historyPos = null;
    this.historySearch = null;
    inputEl.val('');
    var div = $('<div class="incomplete-command-set"></div>');
    var sym = 'cmd-output-' + genSym();
    div.attr('id', sym);
    var cmdLine = $('<span class="cmd-line"><span class="cmd"></span> <br />');
    var cmd = $('.cmd', cmdLine);
    div.append(cmdLine);
    var node = parse(input);
    return node.toArgs((function execute(node) {
      /* At this point the node is fully resolved */
      var display = node.toCommand();
      cmd.text(display);
      this.writeEl(div);
      var parts = node.toArgsNoInterpolate();
      var envOverride = {};
      while (parts.length) {
        var match = (/^([A-Z_][A-Z0-9_]*)=(.*)$/i).exec(parts[0]);
        if (! match) {
          break;
        }
        envOverride[match[1]] = match[2];
        parts.splice(0, 1);
      }
      if (! parts.length) {
        // Environment setting only
        this.env(envOverride);
        var el = $('#' + sym, this.el);
        el.removeClass("incomplete-command-set");
        el.addClass("command-set");
        return;
      }
      var env = jQuery.extend({}, this.env(), envOverride);
      console.log('running', parts, node.toXML(), env);
      if (this.commands[parts[0]]) {
        var el = $('#' + sym, this.el);
        this.commands[parts[0]].call(
          this,
          function () {
            el.removeClass("incomplete-command-set");
            el.addClass("command-set");
          },
          parts.slice(1),
          {
            cwd: this.cwd(),
            env: env
          });
        return;
      }
      var child = connection.exports.child_process.spawn(
        parts[0], parts.slice(1), {
          cwd: this.cwd(),
          env: env
        });
      child.stdout.on("data", (function (data) {
        this.write(data, "stdout", sym);
      }).bind(this));
      child.stderr.on("data", (function (data) {
        this.write(data, "stderr", sym);
      }).bind(this));
      child.on("open", (function () {
        var el = $('#' + sym, this.el);
        el = $(".cmd", el);
        el.attr("title", "pid: " + child.pid + " " + el.attr("title"));
      }).bind(this));
      child.on("exit", (function (code) {
        var el = $('#' + sym, this.el);
        el.removeClass("incomplete-command-set");
        el.addClass("command-set");
        el = $(".cmd", el);
        if ((el.attr("title") || "").search(/pid/) !== -1) {
          var title = el.attr("title");
          title = title.replace(/pid\:\s*\d+\s*/, "");
          el.attr("title", title);
        }
      }).bind(this));
      // FIXME: catch exit
      return this.persist();
    }).bind(this), (function expandHomedir(node, callback) {
      /* Homedirs */
      var user = node.user;
      if (user in this.homeCache) {
        callback(this.homeCache[user]);
        return;
      }
      if (!user) {
        callback(connection.env['HOME']);
        return;
      }
      getHomeDir((function(dir) {
        this.homeCache[user] = dir;
        callback(dir);
      }).bind(this), user, this.cwd(), this.env());
    }).bind(this), (function expandVars(node, callback) {
      /* vars */
      var name = node.stringContents();
      return callback(this.env(name) || "");
    }).bind(this), (function expandInterpolation(node, callback) {
      /* interpolation */
      var args = node.toArgsNoInterpolate();
      var child = connection.exports.child_process.spawn(
        args[0], args.slice(1), {
          cwd: this.cwd(),
          env: this.env()
        });
      var output = "";
      child.stdout.on("data", (function (data) {
        output += data;
      }).bind(this));
      child.stderr.on("data", (function (data) {
        this.write(data, "stderr");
      }).bind(this));
      child.on("exit", function () {
        callback(output);
      });
    }).bind(this), (function wildcardExpander(node, callback) {
      /* wildcards */
      var pattern = node.stringContents();
      return expandWildcard((function(doc) {
        return callback(doc);
      }).bind(this), pattern, this.cwd(), this.env());
    }).bind(this));
  },

  persist: function() {
    if (!this.persistRestored) {
      return;
    }
    if (this.persistId) {
      cancelTimeout(this.persistId);
      this.persistId = null;
    }
    var p = this.persister;
    p.save('html', $('.output', this.el).html());
    p.save('history', this.history);
    p.save('cwd', this.cwd());
    p.save('env', this.env());
    p.save('genSym', genSym.counter);
  },

  restore: function() {
    var p = this.persister;
    var html = p.get('html', '');
    if (html) {
      $('.output', this.el).html(html);
    }
    this.history = p.get('history', []);
    this.cwd(p.get('cwd', '/'));
    this.env(p.get('env', {}));
    this.paneChange();
    this.persistRestored = true;
    var c = p.get('genSym', 0);
    if (c > genSym.counter) {
      genSym.counter = c;
    }
  },

  commands: {
    cd: function (finish, args, options) {
      // FIXME: implement cd -
      var path = args[0];
      if (path === undefined) {
        path = this.env("HOME");
      }
      path = pathjoin(options.cwd, path);
      connection.exports.fs.exists(path, (function (exists) {
        if (exists) {
          this.cwd(path);
        } else {
          this.write("Error: " + path + " does not exist");
        }
        finish();
      }).bind(this));
    }
  }

};

MixinEvents(Console.prototype);

function expandWildcard(callback, pattern, cwd, env) {
  var _ref, pat;
  var base = pattern;
  var wildcard = '';
  while (true) {
    if (base.indexOf('*') !== -1) {
      _ref = splitpath(base), base = _ref[0], pat = _ref[1];
      if (wildcard) {
        wildcard = pat + '/' + wildcard;
      } else {
        wildcard = pat;
      }
    } else {
      break;
    }
  }
  base || (base = '.');
  var child = connection.exports.child_process.spawn('find', [base, '-maxdepth', '1', '-wholename', wildcard, '-print0'], {cwd: cwd, env: env});
  child.finish(function (stdout) {
    var _i, _len;
    var files = stdout.split('\u0000');
    var doc = new Node('span');
    for (_i = 0, _len = files.length; _i < _len; _i++) {
      var file = files[_i];
      if (file.substr(0, 2) === './') {
        file = file.substr(2);
      }
      doc.push(new Node('arg', null, file));
      doc.push(' ');
    }
    callback(doc);
  });
}

function quoteLower(s) {
  return s.replace(/[\x00-\x08\x0b-\x1f]/g, function (m) {
    var code = m[0].charCodeAt(0);
    var letter = code.toString(16);
    if (letter.length == 1) {
      letter = '0' + letter;
    }
    return "\\x" + letter;
  });
}

function getHomeDir(callback, user, cwd, env) {
  var command;
  var child = connection.exports.child_process.spawn('python', ['-c', 'import pwd, sys; print pwd.getpwnam(sys.argv[1]).pw_dir', user], {cwd: cwd, env: env});
  child.finish(function (stdout) {
    callback(stdout);
  });
}

function genSym() {
  return 'sym' + (++arguments.callee.counter);
}
genSym.counter = 0;

function Persister(storage) {
  this.storage = storage || window.localStorage;
}

Persister.prototype = {
  save: function(key, value) {
    var v;
    if (v === null) {
      return this.storage.removeItem('persister::' + key);
    } else {
      v = JSON.stringify(value);
      return this.storage.setItem('persister::' + key, v);
    }
  },

  get: function(key, defaultValue) {
    defaultValue = defaultValue || null;
    return defaultValue;
    var v = this.storage.getItem('persister::' + key);
    if (v != null) {
      return JSON.parse(v);
    } else {
      return defaultValue;
    }
  },

  clear: function () {
    var toDelete = [];
    for (var i=0; i<this.storage.length; i++) {
      var key = this.storage.key(i);
      if (key.indexOf('persister::') === 0) {
        toDelete.push(key);
      }
    }
    for (var i=0; i<toDelete.length; i++) {
      this.storage.removeItem(toDelete[i]);
    }
  }

};

function expandFile(event) {
  return $(event.target).css({
    "background-color": "#f00"
  });
}
