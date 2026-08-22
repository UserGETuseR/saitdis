// Городская модель сети. Сочи — первая рабочая глава; выбор гостя влияет
// на команду, сообщения, заказы и сертификаты, а не только на подпись в UI.
window.Branches = (function () {
  const KEY="chay_branch_v1";
  const fallback=[
    {id:"sochi",city:"Сочи",chapter:"Морской свет",subtitle:"Чай после солнца · первая глава сети",accent:"#B85C2C",position:10,active:true},
    {id:"rostov",city:"Ростов",chapter:"Тёплый ритм",subtitle:"Разговор, который не хочется торопить",accent:"#2E3F35",position:20,active:true},
    {id:"krasnodar",city:"Краснодар",chapter:"Южный сад",subtitle:"Спокойная щедрость большого стола",accent:"#5A7560",position:30,active:true},
    {id:"moscow",city:"Москва",chapter:"Тихий фокус",subtitle:"Пауза внутри большого города",accent:"#0E0E0E",position:40,active:true},
  ];
  let items=fallback.slice(), selected=localStorage.getItem(KEY)||"sochi", summaries=[];
  const listeners=[];
  const byId=(id)=>items.find((item)=>item.id===id)||items[0];
  function emit(){const value=current();listeners.forEach((fn)=>{try{fn(value);}catch(_){}});}
  function current(){const user=window.Auth?.current?.();return byId(user&&user.role!=="owner"?(user.branchId||selected||"sochi"):(selected||"sochi"));}
  async function initialize(){
    try{if(window.ApiClient?.isReady?.()){const result=await ApiClient.auth.branches();if(result.items?.length)items=result.items;}}
    catch(_){}
    const user=window.Auth?.current?.();
    if(user?.branchId&&user.role!=="owner")selected=user.branchId;
    if(!byId(selected))selected="sochi";
    localStorage.setItem(KEY,selected);emit();return current();
  }
  async function select(id,{save=true}={}){
    const next=byId(id),user=window.Auth?.current?.();
    if(!next||next.id!==id)return{ok:false,error:"Город сети не найден"};
    if(user&&["master","admin"].includes(user.role)&&user.branchId!==id)return{ok:false,error:"Рабочий город сотрудника назначает директор"};
    selected=id;localStorage.setItem(KEY,id);emit();
    if(save&&user?.role==="client"){
      const result=await Auth.updateAccount({branchId:id});
      if(!result.ok)return result;
      if(window.ApiClient?.isReady?.())await Auth.refreshTeam?.(id);
      emit();
    }
    return{ok:true,branch:next};
  }
  async function loadSummaries(){try{summaries=(await ApiClient.auth.branchSummary()).items||[];}catch(_){summaries=[];}return summaries.slice();}
  return{initialize,current,all:()=>items.slice(),byId,select,subscribe(fn){listeners.push(fn);},summaries:()=>summaries.slice(),loadSummaries};
})();
