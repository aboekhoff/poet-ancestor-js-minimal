// FIXME (add back support for qualified symbols and keywords)

function Position(offset, line, column, origin) {
    this.offset = offset;
    this.line   = line;
    this.column = column;
    this.origin = origin;
}

Position.prototype.toString = function() {
    return "line "   + this.line   + ", " +
	"column " + this.column + ", " +
	"at "     + (this.origin || "unknown location");
};

function Reader() {	
    this.input  = null;
    this.offset = 0;
    this.line   = 1;
    this.column = 1;
    this.origin = "unknown";
}

Reader.create = function(input, origin) {
    var reader   = new Reader();
    if (input)  { reader.input  = input }
    if (origin) { reader.origin = origin }
    return reader;
}

Reader.hexRegex    = /0(x|X)[0-9a-fA-F]+/;
Reader.octRegex    = /0[0-7]+/;
Reader.intRegex    = /[0-9]+/;
Reader.floatRegex  = /[0-9]+\.[0-9]+/;
Reader.binaryRegex = /0(b|B)[01]+/;

Reader.escapeMap = {
    'n'  : '\n',
    'r'  : '\r',
    'f'  : '\f',
    'b'  : '\b',
    't'  : '\t',
    '"'  : '"',
    '\\' : '\\'
};

Reader.notTerminal = function(c) {
    switch (c) {
    case ' ':
    case '\t':
    case '\n':
    case '\r':
    case '\f':
    case ';':
    case '(':
    case ')':
    case '"':
    case "'":
    case '`':
	return false;
    default:
	return true;
    }
};

Reader.prototype = {
    constructor: Reader,

    makeList: function(list, position) {
	list['source-position'] = position
	return list
    },

    reset: function(input, origin) {
	this.input  = input;
	this.origin = origin;
	this.offset = 0;
	this.line   = 1;
	this.column = 1;
    },

    loadPosition: function(position) {
	this.offset = position.offset;
	this.line   = position.line;
	this.column = position.column;
	this.origin = position.origin;		
    },

    getPosition: function() {
	return new Position(
	    this.offset,
	    this.line,
	    this.column,
	    this.origin
	);
    },

    isEmpty: function() {
	this.readWhitespace();
	return this.offset >= this.input.length;
    },

    peek: function() {
	return this.input[this.offset];
    },

    pop: function() {
	var c = this.peek();
	this.offset++;
	return c;
    },

    popWhile: function(pred) {
	var s = [];
	for(;;) {
	    var c = this.peek();
	    if (c == null || !pred(c)) { break; }
	    s.push(this.pop());
	}
	return s.join("");
    },

    readWhitespace: function() {
	var inComment = false;
	loop:for(;;) {
	    var c = this.peek();
	    if (c == null) { return; }

	    switch(c) {
	    case ';' : 
		inComment = true; 
		this.pop(); 
		continue loop;

	    case '\n': 
	    case '\r':
	    case '\f': 
		inComment = false;

	    case ' ' :
	    case '\t':
		this.pop();
		continue loop;

	    default:
		if (inComment) { 
		    this.pop(); 
		} else {
		    return;
		}
		
	    }
	}
    },

    readSexp: function() {
	this.readWhitespace();
	var nextChar = this.peek();

	switch (nextChar) {
	case ')': this.syntaxError('unmatched closing paren');
	case '(': return this.readList();
	case '"': return this.readString();
	case "'": return this.readQuote();
	case ',': return this.readUnquote();
	case '`': return this.readQuasiquote();
	default:  return this.readAtom();
	}
    },

    readQuote: function() {
	var position = this.getPosition();
	this.pop();
	return this.makeList(
	    [Symbol.coreSymbol('quote', position),
	     this.readSexp()], 
	    position);
    },

    readQuasiquote: function() {
	var position = this.getPosition();
	this.pop();
	return this.makeList(
	    [Symbol.coreSymbol('quasiquote'),
	     this.readSexp()],
	    position);		
    },

    readUnquote: function() {
	var position = this.getPosition();
	var name     = 'unquote';
	this.pop();

	if (this.peek() == '@') {
	    this.pop();
	    name = 'unquote-splicing';
	}				

	return this.makeList(
	    [Symbol.coreSymbol(name), this.readSexp()]
	)

    },

    readList: function() {
	var position = this.getPosition();		
	var list     = [];
	this.pop();

	loop:for(;;) {			
	    this.readWhitespace();
	    var c = this.peek();
	    switch(c) {
	    case null : this.error('unclosed list', position);
	    case ')'  : this.pop(); return this.makeList(list, position);
	    default   : list.push(this.readSexp()); continue loop;
	    }
	}
    },

    readString: function() {
	var position = this.getPosition();
	var string   = [];
	this.pop();
	loop:for(;;) {
	    var c = this.pop();
	    switch(c) {
	    case null: this.error('unclosed string literal', position);
	    case '"' : return string.join("");
	    case '\\':
		var position2 = this.getPosition();
		var cc = this.escapeMap[this.pop()];
		if (!cc) { this.error('invalid escape character', position2); }
		this.string.push(cc);
		continue;
	    default:
		string.push(c);
		continue;
	    }
	}
    },

    parseNumber: function(string, position) {
	var sign = 1;
	if (string[0] == '-') {
	    sign   = -1;
	    string = string.substring(1);
	}

	switch (true) {
	case Reader.floatRegex.test(string)  : return sign * parseFloat(string);
	case Reader.hexRegex.test(string)    : return sign * parseInt(string, 16);
	case Reader.octRegex.test(string)    : return sign * parseInt(string, 8);
	case Reader.binaryRegex.test(string) : return sign * parseInt(string, 2);
	case Reader.intRegex.test(string)    : return sign * parseInt(string, 10);
	default:
	    throw Error('invalid number literal at ' + position);
	}
    },

    parseSymbol: function(string, position) {
	if (string[0] == ":") {
	    return Keyword(string.substring(1))
	}

	else if (/[^:]+::[^:]+/.test(string)) {
	    var segments = string.split(/::/)
	    return new Symbol(segments[0], segments[1])
	}

	else {
	    return new Symbol(null, string)
	}
	
    },

    readAtom: function() {
	var position = this.getPosition();
	var string   = this.popWhile(Reader.notTerminal);

	switch (string) {
	case '#t'    : return true;
	case '#f'    : return false;
	case '#nil'  : return null;
	case '#void' : return undefined;
	}

	if (/\d|(-\d)/.test(string[0])) {
	    return this.parseNumber(string, position);
	} else {
	    return this.parseSymbol(string, position);
	}

    }    

};

