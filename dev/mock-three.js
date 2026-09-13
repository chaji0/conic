// Minimal auto-mocking stub for THREE.js, used ONLY for local JS-logic
// crash testing in this sandbox (no network access to the real CDN here).
// The real cdnjs three.js r128 build will be used in the user's browser.
(function(){
  function handlerFor(){
    return {
      get: function(target, prop){
        if (prop === Symbol.toPrimitive) return function(hint){ return hint === 'string' ? '' : 0; };
        if (prop === Symbol.iterator) return function(){ return { next: function(){ return {done:true}; } }; };
        if (prop === 'then') return undefined;
        if (prop === 'toString') return function(){ return ''; };
        if (prop === 'valueOf') return function(){ return 0; };
        if (!(prop in target)) target[prop] = makeNode(String(prop));
        return target[prop];
      },
      set: function(target, prop, value){ target[prop] = value; return true; },
      apply: function(target, thisArg, args){ return makeNode('call'); },
      construct: function(target, args){ return makeNode('new'); },
      has: function(){ return true; }
    };
  }
  function makeNode(name){
    var fn = function(){};
    return new Proxy(fn, handlerFor());
  }

  var THREE = makeNode('THREE');

  // Real canvas element so DOM insertion / addEventListener / getBoundingClientRect work.
  THREE.WebGLRenderer = function(opts){
    var canvas = document.createElement('canvas');
    return {
      domElement: canvas,
      setSize: function(){}, setPixelRatio: function(){}, render: function(){},
      setAnimationLoop: function(){}, setClearColor: function(){}, dispose: function(){},
      setScissorTest: function(){}, setScissor: function(){}, setViewport: function(){},
      shadowMap: { enabled:false, type:0 }
    };
  };
  var t0 = Date.now();
  THREE.Clock = function(){
    var last = Date.now();
    return {
      elapsedTime: 0,
      getDelta: function(){ var now = Date.now(); var d=(now-last)/1000; last=now; this.elapsedTime += d; return Math.min(d,0.05); }
    };
  };
  THREE.PCFSoftShadowMap = 1;
  THREE.BackSide = 1; THREE.DoubleSide = 2; THREE.FrontSide = 0;
  THREE.RepeatWrapping = 1000;
  THREE.LinearFilter = 1006;

  window.THREE = THREE;
})();
