window.Notifications = (function(){
  const col=DB.collection("notifications");
  return {
    all(){const user=Auth.current();return col.all().filter((item)=>!item.userId||item.userId===user?.id).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));},
    unread(){return this.all().filter((item)=>item.status!=="read");},
    add(data){if(ApiClient.isReady())return null;return col.insert({userId:Auth.current()?.id||null,branchId:Branches.current()?.id||"sochi",status:"new",channel:"in_app",...data,createdAt:Date.now()});},
    // Локальное обновление само уходит на сервер через db.js → ApiClient.pushRecord,
    // где для уведомлений вызывается PATCH /notifications/:id/read.
    // Явный второй вызов давал два одинаковых запроса на одно нажатие.
    markRead(id){return col.update(id,{status:"read",readAt:Date.now()});},
  };
})();
