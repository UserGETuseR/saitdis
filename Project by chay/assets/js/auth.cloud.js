// Cloud-aware Auth facade. Existing screens keep a synchronous current() API,
// while network actions return promises and update the in-memory session.
(function () {
  const LocalAuth = window.Auth;
  let cloud = false;
  let currentUser = null;
  let users = [];
  let publicTeam = [];
  const listeners = [];

  const demoAllowed = () => typeof window.CHA_DEMO_ALLOWED === "function" && window.CHA_DEMO_ALLOWED() === true;
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0,2).map((word) => word[0]).join("").toUpperCase();
  function normalize(user) { return user ? { ...user, initials: initials(user.name), profile: user.profile || {} } : null; }
  function emit() { listeners.forEach((fn) => { try { fn(current()); } catch (_) {} }); }
  // Вне демо-режима локальная сессия не считается входом: единственный источник
  // прав — защищённая серверная сессия.
  function current() { return cloud ? currentUser : (demoAllowed() ? LocalAuth.current() : null); }
  const OFFLINE = { ok: false, error: "Нет связи с сервером чайной. Обновите страницу или попробуйте позже." };
  function setCurrent(user) { currentUser = normalize(user); emit(); return currentUser; }
  async function refreshUsers() {
    if (!cloud || !currentUser || !["master","admin","owner"].includes(currentUser.role)) { users = currentUser ? [currentUser] : []; return users; }
    try { users = (await ApiClient.auth.users()).items.map(normalize); } catch (_) { users = [currentUser]; }
    return users;
  }
  async function refreshTeam(branchId) { if(!cloud||!currentUser){publicTeam=[];return publicTeam;}try{publicTeam=(await ApiClient.auth.team(branchId||currentUser.branchId||window.Branches?.current?.().id)).items||[];}catch(_){publicTeam=[];}return publicTeam; }

  const facade = {
    async initialize() {
      cloud = await ApiClient.init();
      // Локальный контур поднимается только в явно разрешённом демо-режиме.
      // В production недоступный API означает «нет связи», а не «войди как admin».
      if (!cloud) { if (demoAllowed()) LocalAuth.seedIfEmpty(); return demoAllowed() ? LocalAuth.current() : null; }
      const result = await ApiClient.auth.me();
      setCurrent(result.user);
      await refreshUsers();
      await refreshTeam();
      if (currentUser) await ApiClient.hydrate(currentUser);
      return currentUser;
    },
    isCloud: () => cloud,
    subscribe(fn) { listeners.push(fn); LocalAuth.subscribe((user) => { if (!cloud) fn(user); }); },
    current,
    isMaster: () => current()?.role === "master",
    isAdmin: () => ["admin","owner"].includes(current()?.role),
    isStaff: () => ["master","admin","owner"].includes(current()?.role),
    validateLogin: LocalAuth.validateLogin.bind(LocalAuth),
    isLoginTaken(login, exceptId) { return cloud ? users.some((u) => u.id !== exceptId && u.login.toLowerCase() === String(login).toLowerCase()) : LocalAuth.isLoginTaken(login, exceptId); },
    async register(data) {
      if (!cloud) return demoAllowed() ? LocalAuth.register(data) : OFFLINE;
      try { const result = await ApiClient.auth.register(data); setCurrent(result.user); await refreshUsers(); await refreshTeam(); await ApiClient.hydrate(currentUser); return { ok:true, user:currentUser }; }
      catch (error) { return { ok:false, error:error.message }; }
    },
    async login(login, pass) {
      if (!cloud) return demoAllowed() ? LocalAuth.login(login, pass) : OFFLINE;
      try { const result = await ApiClient.auth.login(login, pass); setCurrent(result.user); await refreshUsers(); await refreshTeam(); await ApiClient.hydrate(currentUser); return { ok:true, user:currentUser }; }
      catch (error) { return { ok:false, error:error.message }; }
    },
    isDemoAllowed: demoAllowed,
    async demoLogin(role) {
      if (cloud || !demoAllowed()) return { ok:false, error:"Демо-вход недоступен в рабочем режиме" };
      return LocalAuth.demoLogin(role);
    },
    logout() {
      if (!cloud) return LocalAuth.logout();
      setCurrent(null); users = []; publicTeam=[]; ApiClient.auth.logout().catch(() => {});
    },
    async updateAccount(data) {
      if (!cloud) return LocalAuth.updateAccount(data);
      try { const result=await ApiClient.auth.update(data); setCurrent(result.user); await refreshUsers(); return {ok:true,user:currentUser}; }
      catch(error){return {ok:false,error:error.message};}
    },
    updateProfile(patch) {
      if (!cloud) return LocalAuth.updateProfile(patch);
      currentUser = normalize({ ...currentUser, profile:{ ...(currentUser?.profile||{}), ...patch } }); emit();
      return ApiClient.auth.update({ profile:patch }).catch(() => {});
    },
    async changePassword(oldPass,newPass) {
      if (!cloud) return LocalAuth.changePassword(oldPass,newPass);
      try { await ApiClient.auth.password(oldPass,newPass); return {ok:true}; } catch(error){return {ok:false,error:error.message};}
    },
    addPractice(data) {
      if (!cloud) return LocalAuth.addPractice(data);
      if (!currentUser) return;
      const profile={...currentUser.profile}; profile.meditationMinutes=(profile.meditationMinutes||0)+(data.minutes||0);if(data.breath)profile.breathSessions=(profile.breathSessions||0)+1;
      currentUser=normalize({...currentUser,profile});emit();ApiClient.auth.update({profile}).catch(()=>{});
    },
    listClients: () => {const branchId=window.Branches?.current?.().id||current()?.branchId||"sochi",source=cloud?users:LocalAuth.listClients();return source.filter((u)=>u.role==="client"&&(u.branchId||"sochi")===branchId);},
    listAll: () => cloud ? users.slice() : LocalAuth.listAll(),
    // /api/users отдаёт всех активных пользователей города, поэтому роль
    // фильтруется здесь: иначе гости попадают в список персонала.
    listStaff: () => {const branchId=window.Branches?.current?.().id||current()?.branchId||"sochi",source=cloud?users:LocalAuth.listStaff();return source.filter((u)=>["master","admin","owner"].includes(u.role)).filter((u)=>u.role==="owner"||(u.branchId||"sochi")===branchId);},
    listPublicTeam: () => cloud ? publicTeam.slice() : LocalAuth.listStaff(),
    refreshTeam,
    userById: (id) => cloud ? users.find((u)=>u.id===id)||null : LocalAuth.userById(id),
    async setRole(id,role) {
      if (!cloud) return LocalAuth.setRole(id,role);
      try {const result=await ApiClient.auth.setRole(id,role);users=users.map((u)=>u.id===id?normalize(result.user):u);emit();return {ok:true,user:normalize(result.user)};}catch(error){return {ok:false,error:error.message};}
    },
    async setUserBranch(id,branchId) {
      if(!cloud){const target=LocalAuth.userById(id);if(!target)return{ok:false,error:"Аккаунт не найден"};return LocalAuth.updateUser(id,{branchId});}
      try{const result=await ApiClient.auth.setUserBranch(id,branchId);users=users.map((u)=>u.id===id?normalize(result.user):u);await refreshTeam(branchId);emit();return{ok:true,user:normalize(result.user)};}catch(error){return{ok:false,error:error.message};}
    },
    updateUser(id,patch) { if(!cloud)return LocalAuth.updateUser(id,patch); return Promise.resolve({ok:false,error:"Изменения аккаунта выполняются через защищённый профиль"}); },
    seedIfEmpty() { if(!cloud)LocalAuth.seedIfEmpty(); },
  };
  window.Auth = facade;
})();
