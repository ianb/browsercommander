jshint("shellparser.js");

// => Script passed: ...shellparser.js


function wx(s) {
  if (typeof s == 'string') {
    s = parse(s);
  }
  print(s.toXML());
}

wx('test this out');
// => <span><arg>test</arg> <arg>this</arg> <arg>out</arg></span>

wx('a $var1 ${var2}x');
// => <span><arg>a</arg> <arg><var>var1</var></arg> <arg><var bracketed="1">var2</var>x</arg></span>

wx('"test this\\n" \'some\\thing\'else $(some "stuff") `else`');
/* =>
<span><arg><string quote="double">test this<backslash name="n">
</backslash></string></arg> <arg><string quote="single">some\thing</string>else</arg> <arg><interpolate><arg>some</arg> <arg><string quote="double">stuff</string></arg></interpolate></arg> <arg><interpolate backtick="1"><arg>else</arg></interpolate></arg></span>
*/

wx('ls *.c');
// => <span><arg>ls</arg> <arg><wildcard>*.c</wildcard></arg></span>

wx('ls ~/*.c ~bob/*.c');
// => <span><arg>ls</arg> <arg><wildcard><homedir>~</homedir>/*.c</wildcard></arg> <arg><wildcard><homedir user="bob">~bob</homedir>/*.c</wildcard></arg></span>
