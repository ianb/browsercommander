function MixinEvents(proto) {
  proto.on = function on(name, callback) {
    if (! this._listeners) {
      this._listeners = {};
    }
    if (! this._listeners[name]) {
      this._listeners[name] = [];
    }
    this._listeners[name].push(callback);
  };
  proto.off = proto.removeListener = function off(name, callback) {
    if ((! this._listeners) || ! this._listeners[name]) {
      return;
    }
    var l = this._listeners[name], _len = l.length;
    for (var i=0; i<_len; i++) {
      if (l[i] == callback) {
        l.splice(i, 1);
        break;
      }
    }
  };
  proto.emit = function emit(name) {
    if ((! this._listeners) || ! this._listeners[name]) {
      return;
    }
    var args = Array.prototype.slice.call(arguments, 1);
    var l = this._listeners[name], _len = l.length;
    for (var i=0; i<_len; i++) {
      l[i].apply(this, args);
    }
  };
  return proto;
}
