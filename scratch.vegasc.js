

RT["test::foo"] = [1,2,3,4];

RT["test::inc"] = function(arg_1_0) {
    var local_1_0;
    local_1_0 = RT["vegas::+"](arg_1_0, 1);
    return local_1_0;
};

RT["test::foo"]["map"](RT["test::inc"]);

!function() {
var local_0_0;
local_0_0 = 42;
RT["test::the-oracle"] = function() {
    var local_1_0;
    local_1_0 = local_0_0;
    return local_1_0;
};
}();