(function(global){
  'use strict';
  const Scorm = {
    api: null,
    initialized: false,
    findAPI(win){
      let attempts=0;
      while(win && !win.API && win.parent && win.parent!==win && attempts<12){win=win.parent;attempts++;}
      if(win && win.API) return win.API;
      try{ if(global.opener && global.opener.API) return global.opener.API; }catch(_e){}
      return null;
    },
    init(){
      try{
        this.api=this.findAPI(global);
        if(!this.api) return false;
        const ok=this.api.LMSInitialize('');
        this.initialized=(ok===true || ok==='true');
        if(this.initialized){
          const status=this.get('cmi.core.lesson_status');
          if(!status || status==='not attempted') this.set('cmi.core.lesson_status','incomplete');
          this.commit();
        }
        return this.initialized;
      }catch(e){console.warn('SCORM init',e);return false;}
    },
    get(key){try{return this.initialized?this.api.LMSGetValue(key):'';}catch(_e){return'';}},
    set(key,val){try{return this.initialized?this.api.LMSSetValue(key,String(val)):false;}catch(_e){return false;}},
    commit(){try{return this.initialized?this.api.LMSCommit(''):false;}catch(_e){return false;}},
    saveProgress(state){
      if(!this.initialized) return;
      this.set('cmi.core.score.min','0');
      this.set('cmi.core.score.max','5');
      this.set('cmi.core.score.raw',Number(state.score||0).toFixed(2));
      this.set('cmi.core.lesson_location',String(state.questionIndex||0));
      const slim={q:state.questionIndex,s:state.score,e:state.energy,i:state.integrity,sec:state.sectorProgress,seed:state.seed,mode:state.mode,answers:state.answers};
      this.set('cmi.suspend_data',JSON.stringify(slim).slice(0,3900));
      this.commit();
    },
    finish(score,status,location){
      if(!this.initialized) return false;
      this.set('cmi.core.score.min','0');
      this.set('cmi.core.score.max','5');
      this.set('cmi.core.score.raw',Number(score||0).toFixed(2));
      this.set('cmi.core.lesson_status',status||((score>=3)?'passed':'failed'));
      if(location) this.set('cmi.core.lesson_location',location);
      this.set('cmi.core.exit','');
      this.commit();
      try{this.api.LMSFinish('');}catch(_e){}
      this.initialized=false;
      return true;
    }
  };
  global.NVScorm=Scorm;
})(window);
