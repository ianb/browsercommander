function pathjoin(base, path) {
  var result;
  var segments = path.split(/\//g);
  var paths = [];
  if (segments.length > 1) {
    path = segments[0];
    if (! path) {
      path = "/";
    }
    paths = paths.concat(segments.slice(1));
  }
  if (arguments.length >= 3) {
    paths = paths.concat(Array.prototype.slice.call(arguments, 2));
  }
  base = base.replace(/\/\/+/g, "/");
  if (path == "..") {
    if (base == "/") {
      // Ignore the attempt to go below the root
      result = "/";
    } else {
      var parts = base.split(/\//g);
      if (parts.length == 1) {
        // We can't actually resolve the path, so we'll just leave .. in
        parts.push(path);
      } else {
        parts = parts.slice(0, parts.length - 1);
      }
      result = parts.join("/");
      if (! result) {
        result = "/";
      }
    }
  } else if (/^\//.test(path)) {
    result = path;
  } else {
    if (! /\/$/.test(base)) {
      base += "/";
    }
    if (base.search(/\.\.\/$/) != -1) {
      result = base.replace(/\.\.\/$/, "/") + path;
    } else {
      result = base + path;
    }
  }
  if (paths.length) {
    return pathjoin.apply(null, [result].concat(paths));
  } else {
    return result;
  }
}

function normpath(path) {
  var newPath;
  if (!/\/$/.test(path)) {
    path = path + '/';
  }
  path = path.replace(/\/\/+/g, '/');
  path = path.replace(/\/\.(?=\/)/g, '');
  path = path.replace(/\/([^\/]+)\/\.\.(?=\/)/g, '');
  while (true) {
    newPath = path.replace(/^\/..(?=\/)/g, '');
    if (newPath === path) {
      break;
    }
    path = newPath;
  }
  if (path !== '/') {
    path = path.substr(0, path.length - 1);
  }
  return path;
}

function splitpath(path) {
  var match = /^(.*)\/(^[\/]+)$/.exec(path);
  if (! match) {
    return ['', path];
  }
  return [match[1], match[2]];
}

function getext(path, noLower) {
  var match = /\.([^\.\/]+)$/.exec(path);
  if (match) {
    var ext = match[1];
    if (! noLower) {
      ext = ext.toLowerCase();
    }
    return ext;
  }
  return null;
}
