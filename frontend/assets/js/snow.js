(() => {
    const canvas = document.getElementById("snow");
    if (!canvas) return;
  
    const ctx = canvas.getContext("2d", { alpha: true });
  
    let w = 0, h = 0, dpr = 1;
    let flakes = [];
    let rafId = null;
  
    function resize() {
      dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
      w = window.innerWidth;
      h = window.innerHeight;
  
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
  
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  
    function rand(min, max) {
      return Math.random() * (max - min) + min;
    }
  
    function makeFlake() {
      const r = rand(0.9, 3.2);
      return {
        x: rand(0, w),
        y: rand(-h, 0),
        r,
        vx: rand(-0.25, 0.25),
        vy: rand(0.6, 2.0) * (r / 2.1),
        o: rand(0.25, 0.85),
        drift: rand(0.001, 0.01),
        phase: rand(0, Math.PI * 2),
      };
    }
  
    function init(count) {
      flakes = Array.from({ length: count }, makeFlake);
    }
  
    function step() {
      ctx.clearRect(0, 0, w, h);
  
      for (const f of flakes) {
        f.phase += f.drift;
        f.x += f.vx + Math.sin(f.phase) * 0.25;
        f.y += f.vy;
  
        if (f.y > h + 10) {
          f.y = -10;
          f.x = rand(0, w);
        }
        if (f.x < -10) f.x = w + 10;
        if (f.x > w + 10) f.x = -10;
  
        ctx.beginPath();
        ctx.globalAlpha = f.o;
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
  
      ctx.globalAlpha = 1;
      rafId = requestAnimationFrame(step);
    }
  
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    resize();
  
    if (!reduceMotion) {
      const count = Math.min(190, Math.floor((w * h) / 9000));
      init(count);
      step();
    }
  
    window.addEventListener("resize", () => {
      resize();
      if (!reduceMotion) {
        const count = Math.min(190, Math.floor((w * h) / 9000));
        init(count);
      }
    });
  
    window.addEventListener("beforeunload", () => {
      if (rafId) cancelAnimationFrame(rafId);
    });
  })();
  