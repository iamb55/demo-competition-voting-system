// Confetti animation library
// Based on canvas-confetti but simplified for our use case

(function() {
  'use strict';

  var module = {};
  var defaults = {
    particleCount: 50,
    angle: 90,
    spread: 45,
    startVelocity: 45,
    decay: 0.9,
    gravity: 1,
    ticks: 200,
    x: 0.5,
    y: 0.6,
    shapes: ['square', 'circle'],
    colors: ['#f43f5e', '#8b5cf6', '#06b6d4', '#84cc16', '#eab308', '#f97316']
  };

  function convert(val, transform) {
    return transform ? transform(val) : val;
  }

  function isOk(val) {
    return !(val === null || val === undefined);
  }

  function prop(options, name, transform) {
    return convert(
      options && isOk(options[name]) ? options[name] : defaults[name],
      transform
    );
  }

  function onlyPositiveInt(number) {
    return number < 0 ? 0 : Math.floor(number);
  }

  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  function createCanvas(width, height) {
    var canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '1000';
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function getCanvas() {
    var canvas = document.getElementById('confetti-canvas');
    if (!canvas) {
      canvas = createCanvas(window.innerWidth, window.innerHeight);
      canvas.id = 'confetti-canvas';
      document.body.appendChild(canvas);
      
      // Update canvas size on resize
      window.addEventListener('resize', function() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      });
    }
    return canvas;
  }

  function animate(canvas, fettis, resizer, size, done) {
    var animatingFettis = fettis.slice();
    var context = canvas.getContext('2d');
    var animationId;

    function updateFetti(fetti) {
      fetti.x += Math.cos(fetti.angle2D) * fetti.velocity;
      fetti.y += Math.sin(fetti.angle2D) * fetti.velocity + fetti.gravity;
      fetti.wobble += fetti.wobbleSpeed;
      fetti.velocity *= fetti.decay;
      fetti.tiltAngle += fetti.tiltAngleIncrement;
      fetti.gravity += 0.01;

      return fetti.y < size.height + 20 && fetti.y > -20 && fetti.x > -20 && fetti.x < size.width + 20;
    }

    function drawFetti(fetti) {
      var x = fetti.x;
      var y = fetti.y;
      var wobbleX = x + (10 * Math.cos(fetti.wobble));
      var wobbleY = y + (10 * Math.sin(fetti.wobble));

      context.save();
      context.translate(wobbleX, wobbleY);
      context.rotate(fetti.tiltAngle);

      context.fillStyle = fetti.color;
      context.fillRect(-fetti.size / 2, -fetti.size / 2, fetti.size, fetti.size);

      context.restore();
    }

    function draw() {
      context.clearRect(0, 0, size.width, size.height);

      animatingFettis = animatingFettis.filter(function(fetti) {
        return updateFetti(fetti);
      });

      animatingFettis.forEach(drawFetti);

      if (animatingFettis.length) {
        animationId = requestAnimationFrame(draw);
      } else {
        done();
      }
    }

    draw();

    return {
      addFettis: function(fettis) {
        animatingFettis = animatingFettis.concat(fettis);
        return animationId ? animationId : requestAnimationFrame(draw);
      },
      canvas: canvas,
      promise: new Promise(function(resolve) { done = resolve; })
    };
  }

  function confettiCannon(options) {
    var canvas = getCanvas();
    var size = {
      width: canvas.width,
      height: canvas.height
    };

    var particleCount = prop(options, 'particleCount', onlyPositiveInt);
    var angle = prop(options, 'angle') * (Math.PI / 180);
    var spread = prop(options, 'spread') * (Math.PI / 180);
    var startVelocity = prop(options, 'startVelocity');
    var decay = prop(options, 'decay');
    var gravity = prop(options, 'gravity');
    var colors = prop(options, 'colors');
    var ticks = prop(options, 'ticks');
    var x = prop(options, 'x');
    var y = prop(options, 'y');

    var fettis = [];

    for (var i = 0; i < particleCount; i++) {
      fettis.push({
        x: size.width * x,
        y: size.height * y,
        angle2D: angle + randomInRange(-spread / 2, spread / 2),
        velocity: randomInRange(startVelocity * 0.75, startVelocity),
        decay: decay,
        gravity: gravity * 0.001,
        size: randomInRange(8, 16),
        color: colors[Math.floor(Math.random() * colors.length)],
        tiltAngle: 0,
        tiltAngleIncrement: randomInRange(-0.1, 0.1),
        wobble: randomInRange(0, Math.PI * 2),
        wobbleSpeed: randomInRange(0.01, 0.1)
      });
    }

    return animate(canvas, fettis, null, size, function() {
      canvas.remove();
    });
  }

  module = confettiCannon;

  // Preset functions
  module.burst = function(options) {
    return confettiCannon(Object.assign({}, {
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    }, options));
  };

  module.cannon = function(options) {
    var count = 200;
    var defaults = { origin: { y: 0.7 } };

    function fire(particleRatio, opts) {
      confettiCannon(Object.assign({}, defaults, opts, {
        particleCount: Math.floor(count * particleRatio)
      }));
    }

    fire(0.25, {
      spread: 26,
      startVelocity: 55,
    });

    fire(0.2, {
      spread: 60,
    });

    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8
    });

    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2
    });

    fire(0.1, {
      spread: 120,
      startVelocity: 45,
    });
  };

  // Make it global
  window.confetti = module;
})();


