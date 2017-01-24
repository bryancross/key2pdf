

var testObj = function(){};

var callback = null;

testObj.prototype.setCallback = function(func){
    this.callback = func;
};

testObj.prototype.callback = function(arg) {
    this.callback(arg);
};

module.exports = new testObj();