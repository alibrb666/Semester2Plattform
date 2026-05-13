export function launchConfetti(n = 60) {
  const canvas = document.getElementById('confetti');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#8B5CF6','#A78BFA','#10B981','#06B6D4','#F59E0B','#EF4444','#ffffff'];
  const particles = Array.from({ length: n }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -100,
    vx: (Math.random() - 0.5) * 4,
    vy: Math.random() * 4 + 2,
    rot: Math.random() * 360,
    vrot: (Math.random() - 0.5) * 8,
    w: Math.random() * 8 + 4,
    h: Math.random() * 4 + 2,
    color: colors[Math.floor(Math.random() * colors.length)],
    opacity: 1
  }));

  const start = Date.now();
  const DURATION = 1500;

  function frame() {
    const elapsed = Date.now() - start;
    if (elapsed > DURATION) { ctx.clearRect(0,0,canvas.width,canvas.height); return; }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const progress = elapsed / DURATION;
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;
      p.rot += p.vrot;
      p.opacity = 1 - progress;
      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
