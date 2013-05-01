console.log(Env.registry)

var out = process.stdout

function represent(obj, port, escape) {
    if (obj == null) { port.write("#nil") }
    else if (obj.represent) { obj.represent(port, escape) }
}

function representObjects(objs, port, escape, sep) {
    sep = sep || " "
    var flag = false
    for (var i=0; i<objs.length; i++) {
	if (flag) { port.write(sep) } else { flag=true }
	represent(objs[i], port, escape)
    }
}

Boolean.prototype.represent = function(port, _) {
    port.write(this.valueOf() ? "#t" : "#f")
}

Number.prototype.represent = function(port, _) {
    port.write(this.toString())
}

String.prototype.represent = function(port, escape) {
    port.write(escape ? JSON.stringify(this.valueOf()) : this.valueOf())
}

Symbol.prototype.represent = function(port, _) {
    if (this.namespace) {
	port.write(this.namespace + "::" + this.name)
    } else {
	port.write(this.name)
    }
}

Keyword.prototype.represent = function(port, _) {
    port.write(":" + this.name)
}

Array.prototype.represent = function(port, escape) {
    port.write("(")
    representObjects(this, port, escape)
    port.write(")")
}

function prn() {
    representObjects(arguments, out, true)
    out.write("\n")
}

function println() {
    representObjects(arguments, out, false)
    out.write("\n")
}

function read(string) {
    var rdr = Reader.create(string, 'test')
    return rdr.readSexp()
}

[
    ['foo',   Symbol],
    [':bar',  Keyword],
    ['#t',    Boolean],    
    ['42',    Number],
    ['"foo"', String],
    ['()',    Array]
].forEach(function(pair) {
    var string = pair[0]
    var obj    = read(string)
    var type   = pair[1]
    console.log(string, "=>", typeof obj, obj)
});


var expander = new Expander(
    'test',
    Env.create('test'), 
    Env.createEmpty()
)

function expand(src) {

    var sexp = read(src)    
    prn(sexp)

    var result = expander.expandSexp(sexp)
    prn(result)
    return result

}

expand('(require vegas)')
expand('(+ 1 1)')
expand('(block :the-block 42)')
expand('(block :the-block (return-from :the-block 42)))')
expand('(if #t (if #f 2 3) 2)')
expand('(throw shit-at-the-wall)')
expand('(fun (x) (* x x))')
