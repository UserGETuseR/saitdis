// Редакционный контур «Чайной истории»: черновик → проверка → публикация → архив.
window.Content = (function () {
  const col = DB.collection("publications");
  let publicCache = null;
  // advice — совет чайного мастера о конкретном сорте. Пишет мастер,
  // публикацию подтверждает управляющая, читают гости в карточке чая.
  const KIND = { news:"Новости",story:"Истории",tea:"Чайная карта",event:"Афиша",advice:"Совет мастера" };
  const STATUS = { draft:"Черновик",review:"На проверке",published:"Опубликовано",archived:"В архиве" };
  const PRESET = {
    hand:"img/brand/mark-color.png",
    sage:"img/brand/logo-mark-color.png",
    elder:"img/brand/logo-color.png",
    pattern:"img/brand/pattern-real.png",
  };
  const translit = {а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya"};

  function esc(value) { return String(value ?? "").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char])); }
  function slugify(value) { const base=[...String(value||"").trim().toLowerCase()].map((char)=>translit[char]??char).join("").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,72);return base||`glava-${Date.now().toString(36)}`; }
  function words(value) { return String(value||"").trim().split(/\s+/).filter(Boolean).length; }
  function readingTime(value) { return Math.max(1,Math.ceil(words(value)/180)); }
  function branchId() { return Branches.current()?.id||Auth.current()?.branchId||"sochi"; }
  function ordered(items) { return [...items].sort((a,b)=>Number(b.featured)-Number(a.featured)-(Number(b.publishedAt||b.updatedAt||b.createdAt)-Number(a.publishedAt||a.updatedAt||a.createdAt))); }

  function all() { const active=branchId(),u=Auth.current();return ordered(col.all().filter((item)=>u?.role==="owner"||item.branchId===active||item.authorId===u?.id)); }
  function published() { return ordered((publicCache||col.all()).filter((item)=>item.status==="published"&&item.audience==="public")); }
  async function refreshPublic() { if(!ApiClient.isReady()){publicCache=null;return published();}try{publicCache=await ApiClient.publications.publicList();return published();}catch(_){return published();} }

  function save(data) {
    const u=Auth.current(); if(!u||!["master","admin","owner"].includes(u.role))throw new Error("Редакция доступна только команде");
    const existing=data.id?col.byId(data.id):null,title=String(data.title||"").trim(),body=String(data.body||"").trim();
    if(title.length<3)throw new Error("Напишите заголовок"); if(body.length<20)throw new Error("Текст публикации слишком короткий");
    let status=["draft","review","published","archived"].includes(data.status)?data.status:"draft";if(u.role==="master"&&["published","archived"].includes(status))status="review";
    const slugBase=slugify(data.slug||title),id=existing?.id||DB.uid("pub"),slug=existing?.slug||`${slugBase}-${id.slice(-6).toLowerCase()}`;
    const custom=String(data.coverUrl||"").trim(),coverUrl=custom||PRESET[data.coverPreset]||PRESET.hand;
    const kind=KIND[data.kind]?data.kind:"news";
    // Сорт указывается только у совета мастера и должен существовать в каталоге.
    const teaId=kind==="advice"&&(window.TEAS||[]).some((tea)=>tea.id===data.teaId)?String(data.teaId):null;
    if(kind==="advice"&&!teaId)throw new Error("Выберите сорт чая, к которому относится совет");
    const record={id,branchId:existing?.branchId||(u.role==="owner"&&data.branchId||u.branchId||branchId()),authorId:existing?.authorId||u.id,authorName:existing?.authorName||u.name,title,slug,excerpt:String(data.excerpt||"").trim().slice(0,500),body:body.slice(0,20000),coverUrl,kind,teaId,audience:data.audience==="team"?"team":"public",status,featured:u.role==="master"?false:Boolean(data.featured),publishedAt:status==="published"?(existing?.publishedAt||Date.now()):existing?.publishedAt||null,updatedAt:Date.now(),createdAt:existing?.createdAt||Date.now()};
    return existing?col.update(id,record):col.insert(record);
  }

  // Опубликованные советы: все или по конкретному сорту.
  function advice(teaId) {
    const list=published().filter((item)=>item.kind==="advice");
    return teaId?list.filter((item)=>item.teaId===teaId):list;
  }
  // Материалы журнала без советов — чтобы лента не смешивалась.
  function journal() { return published().filter((item)=>item.kind!=="advice"); }
  function transition(id,status) { const item=col.byId(id);if(!item)throw new Error("Материал не найден");return save({...item,status}); }
  async function remove(id) { const item=col.byId(id);if(!item)return;if(item.status!=="draft")throw new Error("Удалить можно только черновик");col.remove(id); }
  function byKey(key) { return (publicCache||col.all()).find((item)=>item.id===key||item.slug===key)||null; }
  function paragraphs(value) { return String(value||"").split(/\n{2,}/).map((part)=>`<p>${esc(part).replace(/\n/g,"<br>")}</p>`).join(""); }

  return { KIND,STATUS,PRESET,esc,slugify,words,readingTime,all,published,advice,journal,refreshPublic,save,transition,remove,byKey,paragraphs };
})();
