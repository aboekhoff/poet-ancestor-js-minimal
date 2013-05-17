function Emitter() {
    this.buffer    = []
    this.indention = 0
}

Emitter.emitProgram = function(program, options) {
    var e = new Emitter()
    if (options) { for (var v in options) { e[v] = options[v] } }
    e.emitStatements(program)
    return e.getResult()
}

Emitter.bake = function(program, options) {
    var e = new Emitter()
    if (options) { for (var v in options) { e[v] = options[v] } }
    e.emitStatements(program)
    var warhead = Function(e.globalSymbol, e.getResult())
    return warhead
}

Emitter.prototype = {
    indentSize:   4,

    globalSymbol: "RT",

    namespaceSeparator: "::",

    emitProgram: function(program) {
	this.emitStatements(program)
	return this.getResult()
    },

    getResult: function() {
	return this.buffer.join("")
    },

    indent: function() {
	this.indention += this.indentSize
    },

    dedent: function() {
	this.indention -= this.indentSize
    },

    write: function(x) {
	this.buffer.push(x)
    },

    tab: function() {
	var i=this.indention
	while(i--) { this.write(" ") }
    },

    // carriage return
    cr: function() {
	this.write("\n")
	this.tab()
    },

    emitNodes: function(nodes, sep) {
	var started = false
	for (var i=0; i<nodes.length; i++) {
	    if (started) { this.write(sep) } else { started = true }
	    this.emit(nodes[i])
	}
    },

    emitArray: function(nodes) {
	this.write("[")
	this.emitNodes(nodes, ", ")
	this.write("]")
    },

    emitList: function(nodes) {
	this.write("(")
	this.emitNodes(nodes, ", ")
	this.write(")")
    },

    emitStatements: function(nodes) {
	for (var i=0; i<nodes.length; i++) {
	    this.cr()
	    this.emit(nodes[i]);
	    this.write(";")
	}
    },

    emitBlock: function(nodes) {
	this.write("{")
	this.indent()
	this.emitStatements(nodes)
	this.dedent()
	this.cr()
	this.write("}")
    },

    emitLabel: function(node) {
	this.write("block_")
	this.write(node[1])
	this.write("_")
	this.write(node[2])
    },

    emitFlag: function(node) {
	this.write("flag_")
	this.write(node[1])
	this.write("_")
	this.write(node[2])
    },

    emitLabeledBlock: function(prefix, label, block) {
	var hasNonLocalExits = label[3]	

	if (hasNonLocalExits) {	    
	    this.write('var ')
	    this.emitFlag(label)
	    this.write(' = true;')
	    this.cr()
	    this.write('try {')
	    this.indent()
	    this.cr()
	}

	this.emitLabel(label)
	this.write(":")
	this.write(prefix)
	this.write(" ")
	this.emitBlock(block)
	
	if (hasNonLocalExits) {
	    this.dedent()
	    this.cr()

	    this.write("} catch (e) {")
	    this.indent()
	    this.cr()

	    this.write('if (')
	    this.emitFlag(label)
	    this.write(') {')
	    this.indent()
	    this.cr()

	    // flag not thrown
	    this.write('throw e;')
	    this.dedent()
	    this.cr()
	    this.write('}')
	    this.dedent()
	    this.cr()
	    this.write('} finally {')
	    this.indent()
	    this.cr()
	    
	    this.emitFlag(label)
	    this.write(' = false')
	    this.dedent()
	    this.cr()
	    this.write('}')	    
	}

    },

    emit: function(node) {
	var tag = node[0]
	var a   = node[1]
	var b   = node[2]
	var c   = node[3]
	
	switch(tag) {

	case 'IF':
	    this.write('if(')
	    this.emit(a)
	    this.write(') ')
	    this.emitBlock(b)
	    this.write(' else ')

	    if (c[0][0] == 'IF') {
		this.emit(c[0])
	    } else {
		this.emitBlock(c)
	    }
	    break


	case 'DECLARE':
	    this.write('var ')
	    var flag = false
	    for (var i=0; i<b; i++) {
		if (flag) { this.write(', ') } else { flag = true }
		this.write('local_' + a + '_' + i)
	    }
	    break

	case 'PROPERTY':
	    this.emit(a)
	    this.write('[')
	    this.emit(b)
	    this.write(']')
	    break

	case 'RAW':
	    this.write(a)
	    break

	case 'CONST':
	    if (typeof a == 'string') {
		this.write(JSON.stringify(a))
	    }

	    else {
		this.write('' + a)
	    }

	    break;

	case 'GLOBAL': 
	    this.write(this.globalSymbol)
	    this.write("[\"")
	    this.write(a)
	    this.write(this.namespaceSeparator)
	    this.write(b)
	    this.write("\"]")
	    break

	case 'ARG':
	    this.write("arg_" + a + "_" + b)
	    break

	case 'LOCAL':
	    this.write("local_" + a + "_" + b)
	    break

	case 'SET':
	    this.emit(a)
	    this.write(" = ")
	    this.emit(b)
	    break

	case 'FUN':
	    this.write("function")
	    this.emitList(a)
	    this.write(" ")
	    this.emitBlock(b)
	    break

	case 'CALL':
	    this.emit(a)
	    this.emitList(b)
	    break

	case 'THROW':
	    this.write('throw ')
	    this.emit(a)
	    break

	case 'RETURN':
	    this.write('return ')
	    this.emit(a)
	    break	    

	case 'LOOP':
	    this.emitLabeledBlock('for(;;)', a, b)
	    break

	case 'BLOCK':
	    this.emitLabeledBlock('', a, b)
	    break

	case 'LOCAL_EXIT':
	    this.write('break ')
	    this.emitLabel(a)
	    break

	case 'NON_LOCAL_EXIT':
	    this.emitFlag(a)
	    this.write(' = false; ')
	    this.write('throw "NON_LOCAL_EXIT"')
	    break

	case 'RESTARGS':
	    this.emit(a);
	    this.write(' = [];')	    
	    this.cr()

	    this.write('for(var i='+b+', ii=arguments.length; i<ii; i++) {')

	    this.indent()
	    this.cr()

	    this.emit(a)
	    this.write('.push(arguments[i]);')
	    
	    this.dedent()
	    this.cr()

	    this.write("}")
	    break

	case 'THIS':
	    this.emit(a)
	    this.write(' = this;')
	    break

	default:
	    throw Error('unhandled tag in emitter: ' + tag)

	}

    }

}

