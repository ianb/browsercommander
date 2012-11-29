function Browser(pane, dir) {
  this.pane = pane;
  this.dir = dir;
  this.el = $('<div class="browser"></div>');
  this.pane.append(this.el);
  this.refresh();
  var self = this;
  this.el.on("click", ".browser-filename", function () {
    self.fileClick(this);
  });
  this.el.on("click", ".browser-hidden-title", function () {
    self.hiddenClick(this);
  });
  pane.on("expand", (function () {
    this.focus();
  }).bind(this));
  pane.controller = this;
  this.focus();
}

Browser.prototype = {

  refresh: function () {
    this.el.empty();
    this.filenames = null;
    connection.exports.fs.statdir(this.dir, (function (error, files) {
      if (error) {
        var err = $('<div class="error"></div>').text(error);
        this.el.append(err);
        return;
      }
      this.filenames = files;
      this.render();
    }).bind(this));
  },

  render: function () {
    var div = $('<div class="browser-files"></div>');
    var hidden = $(
      '<div class="browser-hidden-container">' +
        '<div class="browser-hidden-title"></div>' +
        '<div style="display: none" class="browser-hidden-files"></div>' +
      '</div>');
    var e = $('<div class="browser-filename"></div>').text("../");
    e.attr("data-filename", "..");
    e.attr("data-dir", this.dir);
    e.addClass("browser-directory");
    e.attr("data-stat", JSON.stringify({isDirectory: true}));
    div.append(e);
    var hiddenCount = 0;
    this.el.append(div);
    var keys = Object.keys(this.filenames);
    keys.sort();
    keys.forEach(function (name) {
      var container = div;
      var stat = this.filenames[name];
      if (name.indexOf(".") == 0) {
        hiddenCount++;
        container = hidden.find(".browser-hidden-files");
      }
      var e = $('<div class="browser-filename"></div>').text(
        stat.isDirectory ? name + "/" : name);
      e.attr("data-filename", name);
      e.attr("data-dir", this.dir);
      if (stat.isDirectory) {
        e.addClass("browser-directory");
      }
      e.attr("data-stat", JSON.stringify(stat));
      container.append(e);
    }, this);
    if (hiddenCount) {
      hidden.find(".browser-hidden-title").text(hiddenCount + " hidden files");
      div.prepend(hidden);
    }
    this.pane.title().text("Browsing: " + this.dir);
  },

  fileClick: function (el) {
    el = $(el);
    var name = el.attr("data-filename");
    var path = pathjoin(el.attr("data-dir"), name);
    var stat = JSON.parse(el.attr("data-stat"));
    if (stat.isDirectory) {
      this.dir = path;
      this.refresh();
      this.emit("chdir", self.dir);
      return;
    }
    var ext = getext(name);
    var paneSet = PaneSet(this.pane.paneSet());
    if (image_extensions[ext]) {
      var url = "/serve?filename=" + encodeURIComponent(path);
      var pane = paneSet.createPane();
      pane.title().text("Image: " + name);
      var img = $('<img>').attr('src', url).css({width: "100%"});
      pane.content().append(img);
      return;
    }
    if (modes_by_extension[ext]) {
      var pane = paneSet.createPane();
      var editor = new Editor(pane, path);
      return;
    }
    console.log('clicked', this, name, stat);
  },

  hiddenClick: function (el) {
    el = $(el).closest(".browser-hidden-container");
    el.find(".browser-hidden-files").toggle();
  },

  focus: function () {
  }

};

MixinEvents(Browser.prototype);
