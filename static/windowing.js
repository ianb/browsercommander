var TOGGLE = {value: "TOGGLE"};
var NOW = {value: "NOW"};


function ElementClass(proto) {
  var name = proto.ElementClassName;
  var requiredClass = proto.RequiredClass;
  var constructor = function (el) {
    if (el instanceof constructor) {
      return el;
    }
    el = $(el);
    if (requiredClass && ! el.hasClass(requiredClass)) {
      throw "The element must have the class ." + requiredClass;
    }
    var existing = el.data(name + "Instance");
    if (existing) {
      return existing;
    }
    var self = this;
    if (! (self instanceof constructor)) {
      self = Object.create(constructor.prototype);
    }
    proto.constructor.call(self, el);
    el.data(name + "Instance", self);
    return self;
  };
  constructor.prototype = proto;
  constructor.name = name;
  constructor.toString = function () {
    return "[" + name + " constructor]";
  };
  return constructor;
}

var KEYS = {
  command: 91,
  alt: 18,
  control: 17,
  shift: 16,
  up: 38,
  down: 40,
  left: 37,
  right: 39,
  pageup: 33,
  pagedown: 34,
  close: 87 // "w"
};

var activeKeys = {};

$(document).on("keyup", function (event) {
  var code = event.which;
  if (code == KEYS.command || code == KEYS.alt || code == KEYS.control || code == KEYS.shift) {
    delete activeKeys[code];
  }
});

$(document).on("keydown", function (event) {
  var code = event.which;
  if (code == KEYS.command || code == KEYS.alt ||
      code == KEYS.control || code == KEYS.shift) {
    activeKeys[code] = true;
  }
  if (((code == KEYS.up || code == KEYS.down) && activeKeys[KEYS.shift]) ||
      (code == KEYS.close && activeKeys[KEYS.control] && activeKeys[KEYS.shift])) {
    var el = $(document.activeElement);
    var pane = el.closest(".pane-content-cell");
    if ((! pane) || ! pane.length) {
      pane = el.closest(".pane-title-cell");
    }
    var paneSet = el.closest(".pane-set");
    if ((! pane) || (! pane.length) || (! paneSet.length)) {
      return;
    }
    if (pane.hasClass("pane-content-cell")) {
      pane = $('#' + pane.attr("data-title-id"));
    }
    pane = Pane(pane);
    paneSet = PaneSet(paneSet);
    if (code == KEYS.close) {
      pane.close();
    } else {
      paneSet.shift(pane, code == KEYS.up ? "up" : "down");
    }
  }
});

var PaneWindow = ElementClass({
  ElementClassName: "PaneWindow",
  RequiredClass: "pane-window",

  constructor: function (table) {
    this.table = table;
    this.init();
  },

  init: function () {
    if (this.table.data("PaneWindowInit")) {
      return;
    }
    this.table.on("dblclick", ".pane-title-cell", function () {
      var pane = Pane($(this).closest(".pane-title-cell"));
      pane.minmax();
    });
    this.table.on("click", ".pane-minmax", function () {
      var pane = Pane($(this).closest(".pane-title-cell"));
      pane.minmax();
    });
    this.table.on("click", ".pane-close", function () {
      var pane = Pane($(this).closest(".pane-title-cell"));
      pane.close();
    });
    this.table.on("click", ".pane-pin", function () {
      var pane = Pane($(this).closest(".pane-title-cell"));
      pane.pinClicked();
    });
    // Creates controls if necessary:
    this.left().panes();
    this.right().panes();
    this.table.data("PaneWindowInit", true);
  },

  paneSet: function (side) {
    if (side != "left" && side != "right") {
      throw "You must select the 'left' or 'right' side (not: " + side + ")";
    }
    return new PaneSet(this.table.find(".pane-" + side + " .pane-set"));
  },

  left: function () {
    return this.paneSet("left");
  },

  right: function () {
    return this.paneSet("right");
  }

});

var _symCounter = Date.now();

var PaneSet = ElementClass({
  ElementClassName: "PaneSet",
  RequiredClass: "pane-set",

  constructor: function (table) {
    this.table = table;
  },

  genSym: function (prefix) {
    prefix = prefix || 'pane-';
    var id = _symCounter++;
    return prefix + id;
  },

  createPane: function (before) {
    var trTitle = $(
      '<tr><td class="pane-title-cell"><div class="pane-title"></div></td></tr>');
    var trContent = $(
      '<tr><td class="pane-content-cell"><div class="pane-content"></div></td></tr>');
    var titleId = this.genSym('pane-title-');
    var contentId = this.genSym('pane-content-');
    trTitle.find('td').attr('id', titleId).attr('data-content-id', contentId);
    trContent.find('td').attr('id', contentId).attr('data-title-id', titleId);
    if (before) {
      if (before === true) {
        this.table.prepend(trContent);
        this.table.prepend(trTitle);
      } else {
        if (before.cell) {
          before = before.cell;
        }
        if (! before.is("tr")) {
          before = before.closest("tr");
        }
        before.before(trTitle);
        before.before(trContent);
      }
    } else {
      this.table.append(trTitle);
      this.table.append(trContent);
    }
    var pane = Pane(trTitle.find("td"));
    this.collapseOthers(pane);
    return pane;
  },

  collapseOthers: function (except) {
    var numberShowing = 0;
    this.panes().forEach(function (p) {
      if (p.collapsed()) {
        return;
      }
      numberShowing++;
      if (p === except) {
        return;
      }
      if (! p.pinned()) {
        numberShowing--;
        p.collapse();
      }
    }, this);
    if (numberShowing > 1) {
      // Then we can apply limited heights on pinned panes
      this.panes().forEach(function (p) {
        if ((! p.collapsed()) && p.pinned() && p !== except) {
          p.setPreferredHeight();
        }
      });
    } else {
      except.unsetPreferredHeight();
    }
  },

  mostRecentOpened: function (cond) {
    var mostRecent = null;
    var mostRecentTime = 0;
    this.panes().forEach(function (p) {
      if (cond && (! cond(p))) {
        return;
      }
      var t = p.lastOpened();
      if (t > mostRecentTime) {
        mostRecentTime = t;
        mostRecent = p;
      }
    }, this);
    return mostRecent;
  },

  panes: function () {
    var result = [];
    this.table.find(".pane-title-cell").each(function () {
      var p = Pane($(this));
      result.push(Pane(this));
    });
    return result;
  },

  expandLast: function (except) {
    // When a pane is hidden or closed, this expands the last opened
    var mostRecent = null;
    var mostRecentOpened = 0;
    var anyOpen = false;
    this.panes().forEach(function (p) {
      if (p === this) {
        return;
      }
      if (! p.collapsed()) {
        anyOpen = true;
      }
      var l = p.lastOpened();
      if (p.collapsed() && l > mostRecentOpened) {
        mostRecent = p;
      }
    }, this);
    if ((! anyOpen) && mostRecent !== null) {
      mostRecent.expand();
      this.collapseOthers(mostRecent);
    }
  },

  shift: function (pane, dir) {
    var prev = null;
    var next = null;
    this.panes().forEach(function (p) {
      if (p == pane) {
        next = false;
        return;
      }
      if (next === null) {
        prev = p;
        return;
      }
      if (next === false) {
        next = p;
        return;
      }
    }, this);
    if (dir == "up" && prev) {
      prev.expand();
      this.collapseOthers(prev);
    } else if (dir == "down" && next) {
      next.expand();
      this.collapseOthers(next);
    }
  }

});

var Pane = ElementClass({
  ElementClassName: "Pane",
  RequiredClass: "pane-title-cell",

  minChar: "_",
  maxChar: "\u21d5", // up-down character
  unpinnedChar: "\u2610", // empty box
  pinnedChar: "\u2611", // box with check
  closeChar: "\u00d7",

  constructor: function (cell) {
    this.titleCell = cell;
    var id = this.titleCell.attr('data-content-id');
    if (! id) {
      var next = this.titleCell.closest("tr").next("tr").find(".pane-content-cell");
      if (! next) {
        throw "Cannot find next sibling .pane-content-cell";
      }
      id = next.attr('id');
      if (! id) {
        id = this.paneSet().genSym('pane-content-');
        next.attr('id', id);
      }
      this.titleCell.attr('data-content-id', id);
    }
    this.contentCell = $('#' + id);
    if (! this.contentCell.hasClass("pane-content-cell")) {
      throw "Paired element has wrong class: " + this.contentCell[0].className + " #" + id;
    }
    var titleId = this.contentCell.attr('data-title-id');
    if (! titleId) {
      titleId = this.titleCell.attr('id');
      if (! titleId) {
        titleId = this.paneSet.genSym('pane-title-');
        this.titleCell.attr('id', titleId);
      }
      this.contentCell.attr('data-title-id', titleId);
    }
    this.lastOpened(NOW);
    if (! this.titleCell.find(".pane-controls").length) {
      this.createPaneControls();
    }
  },

  toString: function () {
    return '[Pane ' + this.title().text() + ']';
  },

  lastOpened: function (value) {
    if (value === NOW) {
      value = Date.now();
    }
    if (value === undefined) {
      return parseInt(this.titleCell.attr("data-last-opened"), 10);
    } else {
      this.titleCell.attr("data-last-opened", value);
      return value;
    }
  },

  createPaneControls: function () {
    var controls = $('<div class="pane-controls">' +
      '<span class="pane-minmax pane-control">' + this.minChar + '</span>' +
      '<span class="pane-pin pane-control">' + this.unpinnedChar + '</span>' +
      '<span class="pane-close pane-control">' + this.closeChar + '</span>' +
      '</div>');
    this.titleCell.prepend(controls);
    if (this.titleCell.attr("data-start-pinned")) {
      this.pinned(true);
    }
  },

  pinned: function (value) {
    var control = this.titleCell.find(".pane-pin");
    if (value === TOGGLE) {
      value = ! this.pinned();
    }
    if (value === undefined) {
      return control.text() == this.pinnedChar;
    } else if (value) {
      control.text(this.pinnedChar);
    } else {
      control.text(this.unpinnedChar);
    }
    return value;
  },

  minmax: function () {
    if (this.pinned()) {
      this.pinned(false);
      return;
    }
    var panes = this.paneSet().panes();
    if (this.collapsed()) {
      this.expand();
      this.paneSet().collapseOthers(this);
    } else {
      this.collapse();
      this.paneSet().expandLast(this);
    }
  },

  pinClicked: function () {
    if (this.pinned()) {
      this.pinned(false);
    } else {
      if (this.collapsed()) {
        this.minmax();
      }
      this.pinned(true);
    }
  },

  close: function () {
    // FIXME: also open most recent?
    var collapsed = this.collapsed();
    var paneSet = this.paneSet();
    this.titleCell.closest("tr").remove();
    this.contentCell.closest("tr").remove();
    if (! collapsed) {
      paneSet.expandLast();
    }
  },

  collapsed: function () {
    return this.content().is(":hidden");
  },

  expand: function () {
    this.contentCell.closest("tr").show();
    this.control("minmax").text(this.minChar);
    this.lastOpened(NOW);
    this.emit("expand", this);
  },

  collapse: function () {
    this.contentCell.closest("tr").hide();
    this.control("minmax").text(this.maxChar);
    this.emit("collapse", this);
  },

  setPreferredHeight: function () {
    var height = this.contentCell.attr("data-preferred-height");
    this.contentCell.css({height: height});
  },

  unsetPreferredHeight: function () {
    this.contentCell.css({height: "auto"});
  },

  content: function () {
    return this.contentCell.find(".pane-content");
  },

  title: function () {
    return this.titleCell.find(".pane-title");
  },

  control: function (name) {
    return this.titleCell.find(".pane-" + name);
  },

  paneSet: function () {
    return PaneSet(this.titleCell.closest(".pane-set"));
  },

  append: function (el) {
    this.content().append(el);
  }

});

MixinEvents(Pane.prototype);
