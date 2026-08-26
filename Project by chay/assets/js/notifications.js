window.Notifications = (function(){
  const col=DB.collection("notifications");
  return {
    all(){const user=Auth.current();return col.all().filter((item)=>!item.userId||item.userId===user?.id).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));},
    unread(){return this.all().filter((item)=>item.status!=="read");},
    add(data){if(ApiClient.isReady())return null;return col.insert({userId:Auth.current()?.id||null,branchId:Branches.current()?.id||"sochi",status:"new",channel:"in_app",...data,createdAt:Date.now()});},
    markRead(id){const item=col.update(id,{status:"read",readAt:Date.now()});if(item&&ApiClient.isReady())ApiClient.notifications.read(id).catch(()=>{});return item;},
  };
})();
