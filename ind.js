var io=new IntersectionObserver(function(e){e.forEach(function(x){if(x.isIntersecting){x.target.classList.add("in");io.unobserve(x.target)}})},{threshold:.1});
document.querySelectorAll(".rv").forEach(function(el){io.observe(el)});
