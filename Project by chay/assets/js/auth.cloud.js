// Cloud-aware Auth facade. Existing screens keep a synchronous current() API,
// while network actions return promises and update the in-memory session.
(function () {
  const LocalAuth = window.Auth;
  let cloud = false;
  let currentUser = null;
  let users = [];
  let publicTeam = [];
  const listeners = [];

  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0,2).map((word) => word[0]).join("").toUpperCase();
  function normalize(user) { return user ? { ...user, initials: initials(user.name), profile: user.profile || {} } : null; }
  function emit() { listeners.forEach((fn) => { try { fn(current()); } catch (_) {} }); }
  function current() { return cloud ? currentUser : LocalAuth.current(); }
  function setCurrent(user) { currentUser = normalize(user); emit(); return currentUser; }
  async function refreshUsers() {
    if (!cloud || !currentUser || !["master","admin","owner"].includes(currentUser.role)) { users = currentUser ? [currentUser] : []; return users; }
    try { users = (await ApiClient.auth.users()).items.map(normalize); } catch (_) { users = [currentUser]; }
    return users;
  }
  async function refreshTeam() { if(!cloud||!currentUser){publicTeam=[];return publicTeam;}try{publicTeam=(await ApiClient.auth.team()).items||[];}catch(_){publicTeam=[];}return publicTeam; }

  const facade = {
    async initialize() {
      cloud = await ApiClient.init();
      if (!cloud) { LocalAuth.seedIfEmpty(); return LocalAuth.current(); }
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
      if (!cloud) return LocalAuth.register(data);
      try { const result = await ApiClient.auth.register(data); setCurrent(result.user); await refreshUsers(); await refreshTeam(); await ApiClient.hydrate(currentUser); return { ok:true, user:currentUser }; }
      catch (error) { return { ok:false, error:error.message }; }
    },
    async login(login, pass) {
      if (!cloud) return LocalAuth.login(login, pass);
      try { const result = await ApiClient.auth.login(login, pass); setCurrent(result.user); await refreshUsers(); await refreshTeam(); await ApiClient.hydrate(currentUser); return { ok:true, user:currentUser }; }
      catch (error) { return { ok:false, error:error.message }; }
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
    listClients: () => cloud ? users.filter((u)=>u.role==="client") : LocalAuth.listClients(),
    listAll: () => cloud ? users.slice() : LocalAuth.listAll(),
    listStaff: () => cloud ? users.filter((u)=>["master","admin","owner"].includes(u.role)) : LocalAuth.listStaff(),
    listPublicTeam: () => cloud ? publicTeam.slice() : LocalAuth.listStaff(),
    userById: (id) => cloud ? users.find((u)=>u.id===id)||null : LocalAuth.userById(id),
    async setRole(id,role) {
      if (!cloud) return LocalAuth.setRole(id,role);
      try {const result=await ApiClient.auth.setRole(id,role);users=users.map((u)=>u.id===id?normalize(result.user):u);emit();return {ok:true,user:normalize(result.user)};}catch(error){return {ok:false,error:error.message};}
    },
    updateUser(id,patch) { if(!cloud)return LocalAuth.updateUser(id,patch); return Promise.resolve({ok:false,error:"Изменения аккаунта выполняются через защищённый профиль"}); },
    seedIfEmpty() { if(!cloud)LocalAuth.seedIfEmpty(); },
  };
  window.Auth = facade;
})();
