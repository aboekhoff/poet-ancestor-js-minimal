var fs   = require('fs')
var path = require('path')

SRC_DIR    = 'src'
OUTPUT_DIR = ''
TARGETS    = [
    'vegas.core.js', 
    'vegas.expander.js', 
    'vegas.reader.js',
    'vegas.main.js'
]

var buf = []

for (var i=0; i<TARGETS.length; i++) {
    var target = TARGETS[i]
    buf.push("// BEGIN " + target + "\n")
    buf.push(fs.readFileSync(path.join(SRC_DIR, target), 'utf8'))
    buf.push("// END " + target + "\n")
}

fs.writeFileSync('vegas.js', buf.join("\n"))
