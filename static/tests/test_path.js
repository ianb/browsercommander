print(pathjoin('a', 'b/', 'c'));
// => a/b/c
print(pathjoin('a', '/b/c', 'd'));
// => /b/c/d
print(pathjoin('a/b/c', '../d'));
// => a/b/d
print(pathjoin('a', '..'));
// => a/..
print(pathjoin('/foo', '..', '..'));
// => /
print(normpath('/a/b/..'));
// => /a
print(normpath('/a/b/'));
// => /a/b
print(normpath('/a/../../b/c/../d'));
// => /b/d
print(normpath('/a/b///../c////'));
// => /a/c
print(normpath('/a/././b/'));
// => /a/b
