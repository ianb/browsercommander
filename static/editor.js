function Editor(pane, path) {
  this.pane = pane;
  this.path = path;
  this.dirty = false;
  this.saving = false;
  console.log('pane', this.pane, this.pane.content);
  var height = this.pane.content().height();
  var width = this.pane.content().width();
  var mode = modes_by_extension[getext(path)] || null;
  this.editor = CodeMirror((function (el) {
    this.el = $(el);
    this.el.width(width);
    this.el.find(".CodeMirror-scroll").height(height);
    this.pane.append(this.el);
  }).bind(this), {
    autofocus: true,
    onChange: this.onChange.bind(this),
    mode: mode,
    lineWrapping: true
  });
  this.pane.on("expand", (function () {
    this.resetSize();
    this.focus();
  }).bind(this));
  this.pane.controller = this;
  this.pane.title().text("Editing: " + this.path);
  this.reload();
}

Editor.prototype = {

  resetSize: function () {
    this.el.hide();
    // Get the natural width/height:
    var height = this.pane.content().height();
    var width = this.pane.content().width();
    this.el.show();
    this.el.width(width);
    this.el.find(".CodeMirror-scroll").height(height);
  },

  reload: function () {
    connection.exports.fs.readFile(this.path, "UTF-8", (function (error, content) {
      if (error) {
        this.pane.append($('<div class="error"></div>').text(error));
        return;
      }
      this.editor.setValue(content);
    }).bind(this));
  },

  onChange: function () {
    this.dirty = true;
    if (this.saving) {
      return;
    }
    var value = this.editor.getValue();
    this.dirty = false;
    connection.exports.fs.writeFile(this.path, value, "UTF-8", (function (error) {
      this.saving = false;
      if (this.dirty) {
        // Change since we started
        this.onChange();
      }
    }).bind(this));
  },

  focus: function () {
    this.editor.focus();
  }

};

MixinEvents(Editor.prototype);

var modes_by_extension = {
  js: "javascript",
  py: "python",
  coffee: "coffeescript",
  css: "css",
  html: "htmlmixed",
  htm: "htmlmixed",
  tmpl: "htmlmixed",
  sh: "shell",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  rst: "rst",
  txt: "null",
  ini: "null",
  cfg: "null"
};

var image_extensions = {
  jpg: true,
  jpeg: true,
  png: true,
  gif: true,
  tiff: true,
  tif: true
};
