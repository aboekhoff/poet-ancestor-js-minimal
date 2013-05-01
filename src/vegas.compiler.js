// it appears we made a small design mistake
// and the environment type used in the expander
// is too specialized to be useful here

function Box(value) {
    this.value = value
}

function Context(env, level, numLocals, numLabels) {
    this.env       = env
    this.level     = level
    this.numLocals = numLocals
    this.numLabels = numLabels
}
