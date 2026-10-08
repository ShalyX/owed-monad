// Tiny locally-drawn illustrated avatars. No remote avatar service,
// account lookup, tracking or implied identification of message senders.
const cast = [
  {bg:"#fee6b0",shirt:"#3c7059",skin:"#ba764a",hair:"#201c22",style:0},
  {bg:"#ffccd0",shirt:"#8e71ba",skin:"#ebae87",hair:"#292327",style:1},
  {bg:"#dcd1ff",shirt:"#e88973",skin:"#f3bf91",hair:"#ab4e2e",style:2},
  {bg:"#b8dcd1",shirt:"#e6b85a",skin:"#75432c",hair:"#221b1a",style:3},
  {bg:"#c8dffd",shirt:"#e07b8d",skin:"#d99668",hair:"#191b2a",style:4},
  {bg:"#ffe2bd",shirt:"#3d6593",skin:"#f1c5a4",hair:"#674b36",style:5}
];
function seedNumber(seed) {
  let x=2166136261;
  for(const char of String(seed ?? "")){x=Math.imul(x ^ char.charCodeAt(0),16777619)>>>0}
  return x;
}
export function avatarSvg(seed, extraClass="") {
  const c=cast[seedNumber(seed)%cast.length];
  const cheek=c.style%2 ? "#ed927f" : "#db8b71";
  const backHair=[
    '<path d="M21 67C11 29 29 12 53 13c25 0 37 17 30 55l-14 11-41-1Z" fill="'+c.hair+'"/>',
    '<path d="M16 81C17 37 20 16 52 15c28 0 36 22 34 64l-16 4-45-1Z" fill="'+c.hair+'"/>',
    '<path d="M24 74c-19-28-4-61 27-60 28-2 43 27 27 60l-14 3-34-1Z" fill="'+c.hair+'"/>',
    '<circle cx="29" cy="34" r="19" fill="'+c.hair+'"/><circle cx="52" cy="19" r="18" fill="'+c.hair+'"/><circle cx="76" cy="36" r="18" fill="'+c.hair+'"/>',
    '<path d="M22 71q-15-35 5-48t46-5q18 19 8 55l-22 6-22-5Z" fill="'+c.hair+'"/>',
    '<path d="M23 76q-9-48 19-60t42 24l-1 40Z" fill="'+c.hair+'"/>'
  ][c.style];
  const fringe=[
    '<path d="M25 39q5-25 23-22t27 19q-15-11-23-8-13 17-27 11Z" fill="'+c.hair+'"/>',
    '<path d="M25 38q9-33 34-22 19 6 18 29Q57 43 48 29q-7 12-23 9Z" fill="'+c.hair+'"/>',
    '<path d="M20 38q5-30 29-27 30 0 31 35-13-19-23-17-19 19-37 9Z" fill="'+c.hair+'"/>',
    '<circle cx="32" cy="32" r="13" fill="'+c.hair+'"/><circle cx="50" cy="26" r="16" fill="'+c.hair+'"/><circle cx="68" cy="32" r="13" fill="'+c.hair+'"/>',
    '<path d="M26 36q2-20 18-21 11 22 31 17-9-23-27-20-17 0-22 24Z" fill="'+c.hair+'"/>',
    '<path d="M25 34q6-26 31-19 24 9 20 27-15-20-26-18-6 16-25 10Z" fill="'+c.hair+'"/>'
  ][c.style];
  const accessory=c.style===0?'<path d="M21 28q25-26 57 0l3 9H18Z" fill="#e7c29a"/><path d="M19 36h65q-4 8-14 7H25Z" fill="#d2a477"/>':
    c.style===2?'<path d="M17 31q28-28 64-1l-5 12H22Z" fill="#7a79c4"/><path d="M21 36h64q-8 6-20 6H17Z" fill="#6667b4"/>':
    c.style===4?'<path d="M33 43q9-7 18 0m0 0q9-7 18 0" fill="none" stroke="#3e3034" stroke-width="3"/><circle cx="37" cy="45" r="11" fill="none" stroke="#32343d" stroke-width="2.4"/><circle cx="64" cy="45" r="11" fill="none" stroke="#32343d" stroke-width="2.4"/>':"";
  const earrings=c.style===1||c.style===2?'<circle cx="24" cy="57" r="2.6" fill="#ffc957"/><circle cx="77" cy="57" r="2.6" fill="#ffc957"/>':"";
  return '<svg class="avatar-art '+extraClass+'" viewBox="0 0 100 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">'+
   '<circle cx="50" cy="50" r="50" fill="'+c.bg+'"/>'+
   '<circle cx="79" cy="22" r="10" fill="#ffffff" opacity=".26"/>'+
   '<path d="M0 100q10-30 42-31h18q33 2 40 31Z" fill="'+c.shirt+'"/>'+
   backHair+'<ellipse cx="50" cy="49" rx="26" ry="30" fill="'+c.skin+'"/>'+
   '<ellipse cx="25" cy="53" rx="5" ry="7" fill="'+c.skin+'"/><ellipse cx="76" cy="53" rx="5" ry="7" fill="'+c.skin+'"/>'+
   '<circle cx="36" cy="51" r="2.9" fill="#302323"/><circle cx="62" cy="51" r="2.9" fill="#302323"/>'+
   '<path d="M43 63q8 9 17 0" stroke="#7d403c" stroke-width="3.5" stroke-linecap="round" fill="none"/>'+
   '<path d="M48 54l-2 6 5 1" stroke="#ad6957" stroke-width="1.5" fill="none" stroke-linecap="round"/>'+
   '<circle cx="32" cy="60" r="5" fill="'+cheek+'" opacity=".45"/><circle cx="68" cy="60" r="5" fill="'+cheek+'" opacity=".45"/>'+
   fringe+accessory+earrings+
   '<circle cx="85" cy="83" r="8" fill="#fff9f2" opacity=".25"/>'+
   '</svg>';
}
export function friendScene() {
  const order=["milo-friend","aya-friend","rory-friend","jules-friend"];
  return '<div class="friend-blob blob-one"></div><div class="friend-blob blob-two"></div>'+
    '<div class="scene-mini-note">Tap a friend <span>✦</span></div>'+
    '<div class="friend-cast">'+order.map((key,i)=>'<button type="button" class="cast-member cast-'+i+'" data-friend-tip="'+i+'" aria-label="Owed crew member '+(i+1)+': show a little reminder" aria-pressed="false">'+avatarSvg(key)+'</button>').join("")+'</div>'+
    '<div class="scene-sticker scene-sticker-heart">♥</div><div class="scene-sticker scene-sticker-star">✳</div>'+
    '<div class="scene-sticker scene-sticker-spark">✦</div>'+
    '<div class="scene-quote" id="sceneQuote" aria-live="polite">“You got me next time!” <span>☕</span></div>';
}
