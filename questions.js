(function(global){
  'use strict';

  const LETTERS=['A','B','C','D','E','F'];
  const clone=x=>JSON.parse(JSON.stringify(x));

  function rng(seed){
    return function(){
      seed|=0;seed=seed+0x6D2B79F5|0;
      let t=Math.imul(seed^seed>>>15,1|seed);
      t=t+Math.imul(t^t>>>7,61|t)^t;
      return((t^t>>>14)>>>0)/4294967296;
    };
  }

  function makeContext(seed){
    const R=rng(seed||20260721);
    const ri=(a,b)=>Math.floor(R()*(b-a+1))+a;
    const pick=a=>a[Math.floor(R()*a.length)];
    const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
    return{R,ri,pick,shuffle};
  }

  const gcd=(a,b)=>{a=Math.abs(a);b=Math.abs(b);while(b){const t=a%b;a=b;b=t;}return a||1;};
  function texNum(value){
    const x=Number(value);if(!Number.isFinite(x))return String(value);if(Number.isInteger(x))return String(x);
    let den=1,num=Math.round(x),found=false;
    for(let d=2;d<=240;d++){const n=Math.round(x*d);if(Math.abs(x-n/d)<1e-10){num=n;den=d;found=true;break;}}
    if(!found){den=10000;num=Math.round(x*den);}
    const g=gcd(num,den);num/=g;den/=g;
    const sign=num<0?'-':'';num=Math.abs(num);
    return den===1?`${sign}${num}`:`${sign}\\frac{${num}}{${den}}`;
  }
  const mtex=m=>String.raw`\begin{bmatrix}${m.map(r=>r.map(texNum).join('&')).join('\\\\')}\end{bmatrix}`;
  const atex=m=>String.raw`\left[\begin{array}{${'c'.repeat(m[0].length-1)}|c}${m.map(r=>r.map(texNum).join('&')).join('\\\\')}\end{array}\right]`;
  const v2=v=>String.raw`\left(${texNum(v[0])},${texNum(v[1])}\right)`;
  const v3=v=>String.raw`\left(${texNum(v[0])},${texNum(v[1])},${texNum(v[2])}\right)`;
  const math=s=>String.raw`\(${s}\)`;
  const display=s=>String.raw`\[${s}\]`;
  const key=x=>JSON.stringify(x);

  function optionSet(correct,distractors,formatter=x=>String(x),shuffle=x=>x){
    const vals=[];
    for(const v of [correct,...distractors]){
      if(!vals.some(z=>key(z)===key(v)))vals.push(clone(v));
      if(vals.length===6)break;
    }
    while(vals.length<6){
      if(typeof correct==='number')vals.push(correct+(vals.length+1)*(vals.length%2?1:-1));
      else if(Array.isArray(correct)){
        const z=clone(correct);
        if(Array.isArray(z[0]))z[0][0]=Number(z[0][0])+(vals.length+1);
        else z[0]=Number(z[0])+(vals.length+1);
        vals.push(z);
      }else vals.push(`${correct} ${vals.length+1}`);
    }
    const mixed=shuffle(vals);
    return{
      options:mixed.map((v,i)=>({letter:LETTERS[i],html:formatter(v),value:i})),
      answer:mixed.findIndex(v=>key(v)===key(correct))
    };
  }

  function comboOptions(correct,choices,shuffle){
    const mixed=shuffle([correct,...choices.filter(x=>x!==correct)].slice(0,6));
    return{options:mixed.map((x,i)=>({letter:LETTERS[i],html:x,value:i})),answer:mixed.indexOf(correct)};
  }

  function build(seed){
    const {ri,pick,shuffle}=makeContext(seed);
    const qs=[];let id=1;
    const add=q=>qs.push({id:id++,boss:false,...q});

    // NIVEL 1 — VECTORES EN R2. Cálculo directo, geometría y aplicaciones.
    {
      const u=[ri(-4,4)||2,ri(-4,4)||-1],v=[ri(-4,4)||-3,ri(-4,4)||2],c=[3*u[0]-2*v[0],3*u[1]-2*v[1]];
      const d=[[3*u[0]+2*v[0],3*u[1]+2*v[1]],[2*u[0]-3*v[0],2*u[1]-3*v[1]],[3*u[1]-2*v[1],3*u[0]-2*v[0]],[-c[0],c[1]],[c[0],-c[1]]];
      add({level:1,topic:'v2d-ops',difficulty:1,type:'mcq',badge:'NIVEL 1 · COMBINACIÓN VECTORIAL',prompt:`Sean ${math(String.raw`\mathbf u=${v2(u)}`)} y ${math(String.raw`\mathbf v=${v2(v)}`)}. Calcule ${math(String.raw`3\mathbf u-2\mathbf v`)}.`,...optionSet(c,d,x=>math(v2(x)),shuffle),hint:`Calcula primero ${math(String.raw`3\mathbf u`)} y ${math(String.raw`2\mathbf v`)}; después resta componente a componente.`,explanation:`${display(String.raw`3\mathbf u-2\mathbf v=${v2(c)}.`)}`,visual:{kind:'vectors',u,v,result:c,showResult:false},instruction:'Programa la trayectoria combinando los dos impulsos.'});
    }
    {
      const u=pick([[6,8],[-6,8],[5,-12],[-8,-15]]),n=Math.hypot(...u),unit=[u[0]/n,u[1]/n];
      const statements=[`${math(String.raw`\|\mathbf u\|=${n}`)}`,`${math(String.raw`\widehat{\mathbf u}=${v2(unit)}`)}`,`${math(String.raw`2\mathbf u=${v2([2*u[0],2*u[1]])}`)}`,'El vector opuesto tiene la misma dirección y el mismo sentido.'];
      const correct='I, II y III';
      add({level:1,topic:'v2d-geometry',difficulty:1,type:'roman',badge:'NIVEL 1 · AFIRMACIONES I–IV',prompt:`Considere ${math(String.raw`\mathbf u=${v2(u)}`)}. Son correctas:<ol class="roman-list" type="I">${statements.map(s=>`<li>${s}</li>`).join('')}</ol>`,...comboOptions(correct,['I y II','II y IV','I, III y IV','II y III','Todas'],shuffle),hint:'Comprueba la norma, divide cada componente por ella y distingue dirección de sentido.',explanation:`I, II y III son correctas. El vector opuesto conserva la dirección, pero cambia el sentido.`,visual:{kind:'vectors',u,v:[-u[0],-u[1]]},instruction:'Valida el protocolo geométrico del vector.'});
    }
    {
      const m=pick([3,4,5,8]),n=pick(m===3?[5]:m===4?[5]:m===5?[13]:[17]),k=Math.sqrt(n*n-m*m);
      add({level:1,topic:'v2d-geometry',difficulty:2,type:'numeric',badge:'NIVEL 1 · PARÁMETRO ENTERO',prompt:`El vector ${math(String.raw`\mathbf v=(k,${m})`)} tiene norma ${math(String.raw`${n}`)} y ${math(String.raw`k>0`)}. Determine el valor entero de ${math('k')}.`,answerValue:k,hint:`Plantea ${math(String.raw`k^2+${m}^2=${n}^2`)} y usa la condición ${math('k>0')}.`,explanation:`${display(String.raw`k=\sqrt{${n*n}-${m*m}}=${k}.`)}`,visual:{kind:'vectors',u:[k,m],v:[0,0]},instruction:'Calcula el parámetro que estabiliza la norma.'});
    }
    {
      const a=4,b=2,c=-3,k=6;
      add({level:1,topic:'v2d-geometry',difficulty:2,type:'numeric',badge:'NIVEL 1 · ORTOGONALIDAD',prompt:`Determine ${math('k')} para que los vectores ${math(String.raw`(k,${a})`)} y ${math(String.raw`(${b},${c})`)} sean perpendiculares.`,answerValue:k,hint:'La perpendicularidad exige que el producto punto sea cero.',explanation:`${display(String.raw`${b}k+${a}(${c})=0\quad\Longrightarrow\quad k=${k}.`)}`,visual:{kind:'vectors',u:[k,a],v:[b,c]},instruction:'Ajusta el ángulo de intercepción a noventa grados.'});
    }
    {
      const u=pick([[2,6],[-3,9],[4,-8]]),lambda=pick([-3,-2,2,4]),v=[lambda*u[0],lambda*u[1]],same=lambda>0;
      add({level:1,topic:'v2d-ops',difficulty:2,type:'tf',badge:'NIVEL 1 · VERDADERO/FALSO',prompt:`Los vectores ${math(String.raw`\mathbf u=${v2(u)}`)} y ${math(String.raw`\mathbf v=${v2(v)}`)} tienen la misma dirección y el mismo sentido.`,answer:same,hint:'Escribe uno como múltiplo escalar del otro y revisa el signo del escalar.',explanation:`${math(String.raw`\mathbf v=${lambda}\mathbf u`)}. ${same?'Como el escalar es positivo, la afirmación es verdadera.':'Como el escalar es negativo, las direcciones coinciden pero los sentidos son opuestos.'}`,visual:{kind:'vectors',u,v},instruction:'Determina la relación direccional de las rutas.'});
    }
    {
      const pair=pick([{a:[6,2],b:[2,0]},{a:[4,6],b:[0,3]},{a:[-3,5],b:[1,1]}]),a=pair.a,b=pair.b;const dot=a[0]*b[0]+a[1]*b[1],den=b[0]*b[0]+b[1]*b[1],coef=dot/den,proj=[coef*b[0],coef*b[1]];
      const d=[[proj[0]+1,proj[1]],[proj[0],proj[1]+1],a,b,[a[0]-proj[0],a[1]-proj[1]]];
      add({level:1,topic:'v2d-geometry',difficulty:3,type:'mcq',badge:'NIVEL 1 · PROYECCIÓN',prompt:`Calcule ${math(String.raw`\operatorname{proj}_{\mathbf b}(\mathbf a)`)} para ${math(String.raw`\mathbf a=${v2(a)}`)} y ${math(String.raw`\mathbf b=${v2(b)}`)}.`,...optionSet(proj,d,x=>math(v2(x)),shuffle),hint:`Usa ${math(String.raw`\operatorname{proj}_{\mathbf b}(\mathbf a)=\frac{\mathbf a\cdot\mathbf b}{\|\mathbf b\|^2}\mathbf b`)}.`,explanation:`${display(String.raw`\operatorname{proj}_{\mathbf b}(\mathbf a)=${v2(proj)}.`)}`,visual:{kind:'projection',a,b,proj},instruction:'Alinea el dron con el corredor mediante la proyección.'});
    }
    {
      const F=pick([[40,15],[25,-10],[30,20]]),d=pick([[6,2],[4,-3],[5,1]]),W=F[0]*d[0]+F[1]*d[1];
      add({level:1,topic:'v2d-ops',difficulty:3,type:'numeric',badge:'NIVEL 1 · APLICACIÓN',prompt:`Una fuerza ${math(String.raw`\mathbf F=${v2(F)}\,\mathrm N`)} desplaza un bloque ${math(String.raw`\mathbf d=${v2(d)}\,\mathrm m`)}. Calcule el trabajo ${math(String.raw`W=\mathbf F\cdot\mathbf d`)} en joules.`,answerValue:W,hint:'Multiplica componentes correspondientes y suma.',explanation:`${display(String.raw`W=${F[0]}(${d[0]})+${F[1]}(${d[1]})=${W}\ \mathrm J.`)}`,visual:{kind:'vectors',u:F,v:d},instruction:'Calcula la energía transferida durante el desplazamiento.'});
    }
    {
      const nu=pick([5,7,8]),nv=pick([6,8,10]),dot=pick([8,12,20]),ans=nu*nu+nv*nv-2*dot;
      add({level:1,topic:'v2d-geometry',difficulty:4,type:'numeric',badge:'NIVEL 1 · IDENTIDAD VECTORIAL',prompt:`Sean ${math(String.raw`\|\mathbf u\|=${nu}`)}, ${math(String.raw`\|\mathbf v\|=${nv}`)} y ${math(String.raw`\mathbf u\cdot\mathbf v=${dot}`)}. Determine el valor entero de ${math(String.raw`\|\mathbf u-\mathbf v\|^2`)}.`,answerValue:ans,hint:`Expande ${math(String.raw`\|\mathbf u-\mathbf v\|^2=\|\mathbf u\|^2+\|\mathbf v\|^2-2\mathbf u\cdot\mathbf v`)}.`,explanation:`${display(String.raw`\|\mathbf u-\mathbf v\|^2=${nu}^2+${nv}^2-2(${dot})=${ans}.`)}`,instruction:'Calcula la separación cuadrática entre las trayectorias.'});
    }

    // NIVEL 2 — VECTORES EN R3 sin producto cruz.
    {
      const u=[ri(-4,4)||1,ri(-4,4)||2,ri(-4,4)||-1],v=[ri(-3,4)||2,ri(-3,4)||-1,ri(-3,4)||3],c=[2*u[0]-v[0],2*u[1]-v[1],2*u[2]-v[2]];
      const d=[[2*u[0]+v[0],2*u[1]+v[1],2*u[2]+v[2]],[u[0]-2*v[0],u[1]-2*v[1],u[2]-2*v[2]],[c[1],c[0],c[2]],[-c[0],c[1],c[2]],[c[0],c[1],-c[2]]];
      add({level:2,topic:'v3d-ops',difficulty:1,type:'mcq',badge:'NIVEL 2 · VECTOR EN R³',prompt:`Sean ${math(String.raw`\mathbf u=${v3(u)}`)} y ${math(String.raw`\mathbf v=${v3(v)}`)}. Calcule ${math(String.raw`2\mathbf u-\mathbf v`)}.`,...optionSet(c,d,x=>math(v3(x)),shuffle),hint:'Opera de manera independiente las tres componentes.',explanation:`${display(String.raw`2\mathbf u-\mathbf v=${v3(c)}.`)}`,instruction:'Define el impulso tridimensional de la nave.'});
    }
    {
      const u=pick([[2,3,6],[-2,6,3],[6,-3,2]]),n=7;
      add({level:2,topic:'v3d-dot',difficulty:1,type:'numeric',badge:'NIVEL 2 · NORMA EN R³',prompt:`Determine la norma de ${math(String.raw`\mathbf u=${v3(u)}`)}.`,answerValue:n,hint:`Usa ${math(String.raw`\|\mathbf u\|=\sqrt{u_1^2+u_2^2+u_3^2}`)}.`,explanation:`${display(String.raw`\|\mathbf u\|=\sqrt{${u[0]}^2+${u[1]}^2+${u[2]}^2}=7.`)}`,instruction:'Calibra el módulo de navegación tridimensional.'});
    }
    {
      const u=[ri(-3,4)||2,ri(-3,4)||-1,ri(-3,4)||3],v=[ri(-3,4)||1,ri(-3,4)||4,ri(-3,4)||-2],ans=u[0]*v[0]+u[1]*v[1]+u[2]*v[2];
      add({level:2,topic:'v3d-dot',difficulty:2,type:'numeric',badge:'NIVEL 2 · PRODUCTO PUNTO 3D',prompt:`Calcule ${math(String.raw`\mathbf u\cdot\mathbf v`)} para ${math(String.raw`\mathbf u=${v3(u)}`)} y ${math(String.raw`\mathbf v=${v3(v)}`)}.`,answerValue:ans,hint:'Multiplica y suma las tres parejas de componentes.',explanation:`${display(String.raw`\mathbf u\cdot\mathbf v=${u[0]}(${v[0]})+${u[1]}(${v[1]})+${u[2]}(${v[2]})=${ans}.`)}`,instruction:'Sincroniza los sensores mediante el producto escalar.'});
    }
    {
      const a=2,b=-1,c=3,d=1,q=5,k=-1;
      add({level:2,topic:'v3d-dot',difficulty:2,type:'numeric',badge:'NIVEL 2 · PARÁMETRO 3D',prompt:`Determine ${math('k')} para que ${math(String.raw`\mathbf u=(${a},${b},k)`)} sea perpendicular a ${math(String.raw`\mathbf v=(${c},${d},${q})`)}.`,answerValue:k,hint:'Impón producto punto igual a cero.',explanation:`${display(String.raw`${a}(${c})+(${b})(${d})+${q}k=0\quad\Longrightarrow\quad k=${k}.`)}`,instruction:'Corrige la tercera componente para lograr ortogonalidad.'});
    }
    {
      const u=[1,2,-1],v=[2,-1,0],dot=0;
      add({level:2,topic:'v3d-dot',difficulty:2,type:'tf',badge:'NIVEL 2 · VERDADERO/FALSO',prompt:`Los vectores ${math(String.raw`\mathbf u=${v3(u)}`)} y ${math(String.raw`\mathbf v=${v3(v)}`)} son ortogonales.`,answer:true,hint:'Calcula su producto punto.',explanation:`${math(String.raw`\mathbf u\cdot\mathbf v=1(2)+2(-1)+(-1)(0)=0`)}, por tanto la afirmación es verdadera.`,instruction:'Verifica la perpendicularidad en el espacio.'});
    }
    {
      const u=[1,0,2],v=[0,3,-1];const sum=[1,3,1],dot=-2;
      const statements=[`${math(String.raw`\mathbf u+\mathbf v=${v3(sum)}`)}`,`${math(String.raw`\mathbf u\cdot\mathbf v=${dot}`)}`,`${math(String.raw`\|\mathbf u\|=\sqrt5`)}`,`${math(String.raw`\|\mathbf v\|=\sqrt{10}`)}`];
      add({level:2,topic:'v3d-ops',difficulty:3,type:'roman',badge:'NIVEL 2 · AFIRMACIONES 3D',prompt:`Sean ${math(String.raw`\mathbf u=${v3(u)}`)} y ${math(String.raw`\mathbf v=${v3(v)}`)}. Son correctas:<ol class="roman-list" type="I">${statements.map(s=>`<li>${s}</li>`).join('')}</ol>`,...comboOptions('I, II, III y IV',['I, II y III','I y IV','II y III','I, III y IV','II, III y IV'],shuffle),hint:'Comprueba una por una las operaciones y las normas.',explanation:'Las cuatro afirmaciones son correctas.',instruction:'Audita el paquete completo de información vectorial.'});
    }
    {
      const P=pick([[1,-2,3],[-2,1,4],[0,3,-1]]),Q=pick([[5,1,-1],[2,-3,1],[4,0,2]]),d=[Q[0]-P[0],Q[1]-P[1],Q[2]-P[2]],ans=d.reduce((s,x)=>s+x*x,0);
      add({level:2,topic:'v3d-ops',difficulty:3,type:'numeric',badge:'NIVEL 2 · DISTANCIA 3D',prompt:`Sean ${math(String.raw`P=${v3(P)}`)} y ${math(String.raw`Q=${v3(Q)}`)}. Determine el valor entero de ${math(String.raw`\|\overrightarrow{PQ}\|^2`)}.`,answerValue:ans,hint:'Resta coordenadas para formar el vector y suma los cuadrados de sus componentes.',explanation:`${display(String.raw`\overrightarrow{PQ}=${v3(d)},\qquad \|\overrightarrow{PQ}\|^2=${ans}.`)}`,instruction:'Calcula la distancia cuadrática hasta la baliza.'});
    }
    {
      const F=[20,-10,15],d=[3,4,-2],W=F[0]*d[0]+F[1]*d[1]+F[2]*d[2];
      add({level:2,topic:'v3d-dot',difficulty:4,type:'numeric',badge:'NIVEL 2 · TRABAJO EN R³',prompt:`Una fuerza ${math(String.raw`\mathbf F=${v3(F)}\,\mathrm N`)} produce un desplazamiento ${math(String.raw`\mathbf d=${v3(d)}\,\mathrm m`)}. Calcule el trabajo en joules.`,answerValue:W,hint:'El trabajo es el producto punto entre fuerza y desplazamiento.',explanation:`${display(String.raw`W=20(3)-10(4)+15(-2)=${W}\ \mathrm J.`)}`,instruction:'Determina la energía del desplazamiento espacial.'});
    }

    // NIVEL 3 — MATRICES 2x2 y 3x3: dimensiones, operaciones, productos y aplicaciones.
    {
      const A=[[ri(-3,4),ri(-3,4)],[ri(-3,4),ri(-3,4)]],B=[[ri(-2,4),ri(-2,4)],[ri(-2,4),ri(-2,4)]],C=A.map((r,i)=>r.map((x,j)=>2*x-3*B[i][j]));
      const d=[A.map((r,i)=>r.map((x,j)=>2*x+3*B[i][j])),A.map((r,i)=>r.map((x,j)=>3*x-2*B[i][j])),C.map(r=>[r[1],r[0]]),C.map(r=>r.map(x=>-x)),[[C[0][0],C[1][0]],[C[0][1],C[1][1]]]];
      add({level:3,topic:'m22-ops',difficulty:1,type:'mcq',badge:'NIVEL 3 · OPERACIÓN 2×2',prompt:`Sean ${math(String.raw`A=${mtex(A)}`)} y ${math(String.raw`B=${mtex(B)}`)}. Calcule ${math(String.raw`2A-3B`)}.`,...optionSet(C,d,x=>math(mtex(x)),shuffle),hint:'Multiplica cada matriz por su escalar y resta entrada a entrada.',explanation:`${display(String.raw`2A-3B=${mtex(C)}.`)}`,visual:{kind:'matrixAdd',A,B,C},instruction:'Combina los módulos matriciales con los coeficientes correctos.'});
    }
    {
      const A=[[1,2],[3,-1]],B=[[2,-1],[4,3]],C=[[10,5],[2,-6]],ans=C[0][1];
      add({level:3,topic:'m22-ops',difficulty:1,type:'numeric',badge:'NIVEL 3 · ENTRADA DE AB',prompt:`Sean ${math(String.raw`A=${mtex(A)}`)} y ${math(String.raw`B=${mtex(B)}`)}. Calcule la entrada ${math(String.raw`(AB)_{12}`)}.`,answerValue:ans,hint:'Multiplica la primera fila de A por la segunda columna de B.',explanation:`${display(String.raw`(AB)_{12}=1(-1)+2(3)=5.`)}`,visual:{kind:'matrixMultiply',A,B,C,highlight:[0,1]},instruction:'Calcula únicamente la celda solicitada del producto.'});
    }
    {
      const A=[[1,2],[0,-1]],B=[[3,1],[2,4]],AB=[[7,9],[-2,-4]],BA=[[3,5],[2,0]];
      add({level:3,topic:'m22-ops',difficulty:2,type:'tf',badge:'NIVEL 3 · NO CONMUTATIVIDAD',prompt:`Para ${math(String.raw`A=${mtex(A)}`)} y ${math(String.raw`B=${mtex(B)}`)}, se cumple ${math(String.raw`AB=BA`)}.`,answer:false,hint:'Calcula al menos una entrada de cada producto.',explanation:`${math(String.raw`AB=${mtex(AB)}`)} y ${math(String.raw`BA=${mtex(BA)}`)}; no coinciden.`,visual:{kind:'matrixMultiply',A,B,C:AB},instruction:'Comprueba si el orden de los procesos puede intercambiarse.'});
    }
    {
      const statements=['El producto \\(AB\\) existe y es \\(3\\times4\\).','El producto \\(BA\\) no existe.','El producto \\(A^TB\\) no existe.','El producto \\(B^TA\\) existe y es \\(4\\times2\\).'];
      add({level:3,topic:'m33-ops',difficulty:2,type:'roman',badge:'NIVEL 3 · DIMENSIONES',prompt:`Sean ${math(String.raw`A\in M_{3\times2}`)} y ${math(String.raw`B\in M_{2\times4}`)}. Son correctas:<ol class="roman-list" type="I">${statements.map(s=>`<li>${s}</li>`).join('')}</ol>`,...comboOptions('I, II y III',['I y II','II y IV','I y IV','I, III y IV','Todas'],shuffle),hint:'Un producto existe si coinciden las dimensiones internas.',explanation:'I, II y III son correctas; \\(B^TA\\) no existe.',instruction:'Verifica la compatibilidad dimensional antes de conectar módulos.'});
    }
    {
      const A=[[1,2],[-1,4]],B=[[4,-1],[5,1]],X=B.map((r,i)=>r.map((x,j)=>(x+2*A[i][j])/3)),ans=X[1][0];
      add({level:3,topic:'m22-ops',difficulty:3,type:'numeric',badge:'NIVEL 3 · ECUACIÓN MATRICIAL',prompt:`La matriz ${math('X')} satisface ${math(String.raw`3X-2A=B`)}, donde ${math(String.raw`A=${mtex(A)}`)} y ${math(String.raw`B=${mtex(B)}`)}. Calcule la entrada ${math(String.raw`x_{21}`)}.`,answerValue:ans,hint:'Despeja \\(X=\\frac13(B+2A)\\).',explanation:`${display(String.raw`X=\frac13\left(${mtex(B)}+2${mtex(A)}\right),\qquad x_{21}=${ans}.`)}`,visual:{kind:'matrixAdd',A,B,C:X},instruction:'Despeja la matriz desconocida del sistema de control.'});
    }
    {
      const A=[[1,1],[0,1]],n=pick([4,5,6,7]);
      add({level:3,topic:'m22-ops',difficulty:3,type:'numeric',badge:'NIVEL 3 · POTENCIA MATRICIAL',prompt:`Sea ${math(String.raw`A=${mtex(A)}`)}. Calcule la entrada ${math(String.raw`(A^{${n}})_{12}`)}.`,answerValue:n,hint:'Calcula \\(A^2\\) y \\(A^3\\) para identificar el patrón.',explanation:`${display(String.raw`A^n=\begin{bmatrix}1&n\\0&1\end{bmatrix},\qquad (A^{${n}})_{12}=${n}.`)}`,visual:{kind:'matrixMultiply',A,B:A,C:[[1,n],[0,1]]},instruction:'Predice la evolución de un proceso matricial repetido.'});
    }
    {
      const C=[[2,1,3],[1,4,2]],q=[40,25,30],r=[195,200];
      add({level:3,topic:'m33-ops',difficulty:3,type:'numeric',badge:'NIVEL 3 · APLICACIÓN MATRICIAL',prompt:`La matriz de consumo es ${math(String.raw`C=${mtex(C)}`)} y el plan de producción es ${math(String.raw`\mathbf q=${v3(q)}^T`)}. Calcule la segunda componente de ${math(String.raw`C\mathbf q`)}.`,answerValue:r[1],hint:'Multiplica la segunda fila de \\(C\\) por el vector de producción.',explanation:`${display(String.raw`(C\mathbf q)_2=1(40)+4(25)+2(30)=200.`)}`,visual:{kind:'matrixMultiply',A:C,B:[[40],[25],[30]],C:[[195],[200]]},instruction:'Calcula el consumo total del segundo recurso.'});
    }
    {
      const A=[[1,-2,4],[0,3,5]],T=[[1,0],[-2,3],[4,5]];
      const d=[A,[[1,-2],[4,0],[3,5]],[[1,0],[-2,5],[4,3]],[[1,4],[-2,5],[0,3]],T.map(r=>r.map(x=>-x))];
      add({level:3,topic:'m33-ops',difficulty:4,type:'mcq',badge:'NIVEL 3 · TRANSPUESTA',prompt:`Determine la transpuesta de ${math(String.raw`A=${mtex(A)}`)}.`,...optionSet(T,d,x=>math(mtex(x)),shuffle),hint:'Cada fila de \\(A\\) se convierte en una columna.',explanation:`${display(String.raw`A^T=${mtex(T)}.`)}`,visual:{kind:'transpose',A,C:T},instruction:'Reorienta la matriz sin alterar sus entradas.'});
    }

    // NIVEL 4 — DETERMINANTES, SISTEMAS Y GAUSS-JORDAN.
    {
      const A=[[1,2,0],[-3,4,5],[2,-1,3]],det=55;
      add({level:4,topic:'m33-systems',difficulty:1,type:'numeric',badge:'NIVEL 4 · DETERMINANTE 3×3',prompt:`Calcule ${math(String.raw`\det(A)`)} para ${math(String.raw`A=${mtex(A)}`)}.`,answerValue:det,hint:'Expande por la primera fila o aplica operaciones por renglón.',explanation:`${display(String.raw`\det(A)=1(17)-2(-19)=55.`)}`,visual:{kind:'determinant',A,det},instruction:'Calcula el valor que estabiliza el reactor.'});
    }
    {
      const d=pick([-5,-4,3,6]),n=3,det2=Math.pow(2,n)*d,detT=d,detNeg=-d;
      const correct=[det2,detT,detNeg],opts=[[2*d,d,-d],[4*d,d,-d],[8*d,-d,d],[-8*d,d,-d],[8*d,d,d]];
      add({level:4,topic:'m33-systems',difficulty:2,type:'mcq',badge:'NIVEL 4 · PROPIEDADES DEL DETERMINANTE',prompt:`Sea ${math(String.raw`A\in M_{3\times3}`)} con ${math(String.raw`\det(A)=${d}`)}. Determine el triple ${math(String.raw`\bigl(\det(2A),\det(A^T),\det(-A)\bigr)`)}.`,...optionSet(correct,opts,x=>math(String.raw`(${x[0]},${x[1]},${x[2]})`),shuffle),hint:'En orden tres, \\(\\det(cA)=c^3\\det(A)\\), \\(\\det(A^T)=\\det(A)\\) y \\(\\det(-A)=-\\det(A)\\).',explanation:`${display(String.raw`\bigl(\det(2A),\det(A^T),\det(-A)\bigr)=(${det2},${detT},${detNeg}).`)}`,instruction:'Aplica propiedades sin expandir la matriz.'});
    }
    {
      const a=pick([2,3,4]),b=pick([2,6,8]),c=pick([1,2,4]);const product=-b*c;
      add({level:4,topic:'m22-systems',difficulty:2,type:'numeric',badge:'NIVEL 4 · PARÁMETRO DEL DETERMINANTE',prompt:`Los valores de ${math('k')} satisfacen ${math(String.raw`\det\begin{bmatrix}k&${b}\\${c}&k-${a}\end{bmatrix}=0`)}. Determine el producto de todos los valores de ${math('k')}.`,answerValue:product,hint:'Obtén el polinomio \\(k(k-a)-bc=0\\) y usa el producto de raíces.',explanation:`El polinomio es ${math(String.raw`k^2-${a}k-${b*c}=0`)}; el producto de sus raíces es ${math(String.raw`${product}`)}.`,visual:{kind:'determinant',A:[[0,b],[c,-a]]},instruction:'Determina el producto de los parámetros críticos.'});
    }
    {
      const u=[4,1],v=[1,3],area=Math.abs(u[0]*v[1]-u[1]*v[0]);
      add({level:4,topic:'m22-systems',difficulty:2,type:'numeric',badge:'NIVEL 4 · ÁREA ORIENTADA',prompt:`Determine el área del paralelogramo generado por ${math(String.raw`\mathbf u=${v2(u)}`)} y ${math(String.raw`\mathbf v=${v2(v)}`)}.`,answerValue:area,hint:'El área es el valor absoluto del determinante formado por los vectores.',explanation:`${display(String.raw`\text{Área}=\left|\det\begin{bmatrix}4&1\\1&3\end{bmatrix}\right|=|12-1|=11.`)}`,visual:{kind:'vectors',u,v},instruction:'Calcula el área de la zona de navegación.'});
    }
    {
      const A=[[1,2,-1,4],[0,3,5,-2],[2,-1,0,6]];
      add({level:4,topic:'m33-systems',difficulty:2,type:'tf',badge:'NIVEL 4 · MATRIZ AUMENTADA',prompt:`La matriz aumentada ${math(atex(A))} representa un sistema de tres ecuaciones con tres incógnitas.`,answer:true,hint:'La última columna corresponde a los términos independientes.',explanation:'Hay tres filas y tres columnas de coeficientes antes de la barra; la afirmación es verdadera.',visual:{kind:'augmented',matrix:A},instruction:'Interpreta correctamente la estructura del sistema.'});
    }
    {
      const statements=['La fila \\([0\\;0\\;0\\mid5]\\) implica inconsistencia.','Una fila completamente nula puede producir una variable libre.','Si hay pivote en cada columna de variables, la solución es única.','Dos ecuaciones proporcionales siempre producen un sistema inconsistente.'];
      add({level:4,topic:'m33-systems',difficulty:3,type:'roman',badge:'NIVEL 4 · CLASIFICACIÓN DE SISTEMAS',prompt:`Sobre la lectura de matrices aumentadas, son correctas:<ol class="roman-list" type="I">${statements.map(s=>`<li>${s}</li>`).join('')}</ol>`,...comboOptions('I, II y III',['I y II','II y IV','I, III y IV','II y III','Todas'],shuffle),hint:'Distingue filas imposibles, variables libres y pivotes.',explanation:'I, II y III son correctas. Dos ecuaciones proporcionales pueden representar la misma ecuación y dar infinitas soluciones.',instruction:'Clasifica los posibles resultados de la reducción.'});
    }
    {
      const x=4,y=-1;const M=pick([[[2,1],[1,-1]],[[3,1],[1,-1]],[[2,-1],[3,1]]]);const a=M[0][0],b=M[0][1],c=M[1][0],d=M[1][1],r1=a*x+b*y,r2=c*x+d*y;
      add({level:4,topic:'m22-systems',difficulty:3,type:'numeric',badge:'NIVEL 4 · SISTEMA 2×2',prompt:`Resuelva el sistema ${display(String.raw`\begin{cases}${a}x${b>=0?'+':''}${b}y=${r1},\\${c}x${d>=0?'+':''}${d}y=${r2}.
\end{cases}`)} Ingrese el valor de ${math('x')}.`,answerValue:x,hint:'Elimina una variable mediante operaciones por renglón.',explanation:`La solución es ${math(String.raw`(x,y)=(${x},${y})`)}.`,visual:{kind:'systemLines',lines:[{m:-a/b,b:r1/b},{m:-c/d,b:r2/d}]},instruction:'Encuentra la coordenada de intersección de las dos rectas.'});
    }
    {
      const M=[[1,-2,3,4],[3,1,-1,2],[-2,4,1,7]];
      const correct=String.raw`R_2\leftarrow R_2-3R_1`;
      const choices=[String.raw`R_2\leftarrow R_2+3R_1`,String.raw`R_1\leftarrow R_1-3R_2`,String.raw`R_3\leftarrow R_3-2R_1`,String.raw`R_2\leftarrow 3R_2-R_1`,String.raw`R_1\leftrightarrow R_2`];
      add({level:4,topic:'m33-systems',difficulty:4,type:'operation',badge:'NIVEL 4 · OPERACIÓN ELEMENTAL',prompt:`En la matriz aumentada ${math(atex(M))}, ¿qué operación elimina el ${math('3')} situado debajo del primer pivote?`,...comboOptions(math(correct),choices.map(math),shuffle),hint:'Resta tres veces la fila pivote a la segunda fila.',explanation:`La operación correcta es ${math(correct)}.`,visual:{kind:'gauss',matrix:M,op:'R2 <- R2 - 3R1'},instruction:'Selecciona la maniobra exacta de eliminación.'});
    }

    // NIVEL 5 — RETOS MIXTOS Y CÁLCULO MULTIETAPA.
    {
      const u=[7,1],v=[2,2],dot=16,den=8,proj=[4,4],perp=[3,-3],ans=18;
      add({level:5,topic:'mixed-boss',difficulty:3,type:'numeric',badge:'NIVEL 5 · DESCOMPOSICIÓN ORTOGONAL',prompt:`Sea ${math(String.raw`\mathbf u=${v2(u)}`)} y ${math(String.raw`\mathbf v=${v2(v)}`)}. Escriba ${math(String.raw`\mathbf u=\mathbf u_{\parallel}+\mathbf u_{\perp}`)}, donde ${math(String.raw`\mathbf u_{\parallel}=\operatorname{proj}_{\mathbf v}(\mathbf u)`)}. Calcule ${math(String.raw`\|\mathbf u_{\perp}\|^2`)}.`,answerValue:ans,hint:'Calcula la proyección, resta el vector paralelo a \(\mathbf u\) y aplica la norma al cuadrado.',explanation:`${display(String.raw`\mathbf u_{\parallel}=(4,4),\qquad \mathbf u_{\perp}=(3,-3),\qquad \|\mathbf u_{\perp}\|^2=18.`)}`,visual:{kind:'projection',a:u,b:v,proj},instruction:'Descompón la trayectoria antes de entrar en el campo de cometas.'});
    }
    {
      const statements=['\\((AB)^T=B^TA^T\\).','Si \\(A^2=A\\), entonces \\((I-A)^2=I-A\\).','Si \\(AB=0\\), necesariamente \\(A=0\\) o \\(B=0\\).','Dos matrices diagonales del mismo orden conmutan.'];
      add({level:5,topic:'mixed-boss',difficulty:3,type:'roman',badge:'NIVEL 5 · PROPIEDADES MATRICIALES',prompt:`Son correctas:<ol class="roman-list" type="I">${statements.map(s=>`<li>${s}</li>`).join('')}</ol>`,...comboOptions('I, II y IV',['I y II','II y III','I, III y IV','II, III y IV','Todas'],shuffle),hint:'La tercera afirmación se refuta con matrices no nulas cuyo producto es cero.',explanation:'I, II y IV son correctas; III es falsa.',instruction:'Distingue propiedades verdaderas de distractores teóricos.'});
    }
    {
      const P=[[2,1],[1,3]],x0=[20,10],x1=[50,50],x2=[150,200];
      add({level:5,topic:'mixed-boss',difficulty:3,type:'numeric',badge:'NIVEL 5 · PROCESO EN DOS ETAPAS',prompt:`La matriz ${math(String.raw`P=${mtex(P)}`)} representa un proceso de actualización y ${math(String.raw`\mathbf x_0=(20,10)^T`)}. Calcule la segunda componente de ${math(String.raw`\mathbf x_2=P^2\mathbf x_0`)}.`,answerValue:200,hint:'Calcula primero \(\mathbf x_1=P\mathbf x_0\) y después \(\mathbf x_2=P\mathbf x_1\).',explanation:`${display(String.raw`\mathbf x_1=(50,50)^T,\qquad \mathbf x_2=(150,200)^T.`)}`,visual:{kind:'matrixMultiply',A:P,B:[[20],[10]],C:[[50],[50]]},instruction:'Predice el estado después de dos etapas.'});
    }
    {
      const A=[[2,1,3],[1,3,2],[4,2,1]],x=[30,40,20],b=[160,190,220];
      add({level:5,topic:'gauss-boss',difficulty:4,type:'numeric',badge:'NIVEL 5 · SISTEMA DE PRODUCCIÓN',prompt:`Una empresa satisface ${math(String.raw`A\mathbf x=\mathbf b`)}, con ${math(String.raw`A=${mtex(A)}`)} y ${math(String.raw`\mathbf b=${v3(b)}^T`)}. Si la solución es entera, determine ${math(String.raw`x_1+x_2+x_3`)}.`,answerValue:90,hint:'Resuelve el sistema 3×3 mediante Gauss–Jordan.',explanation:`La solución es ${math(String.raw`\mathbf x=(30,40,20)^T`)}, por lo que la suma es ${math('90')}.`,visual:{kind:'augmented',matrix:[[2,1,3,160],[1,3,2,190],[4,2,1,220]]},instruction:'Determina el plan total de producción.'});
    }
    {
      const A=[[1,2,0],[-3,4,5],[2,-1,3]],d=55,ans=110;
      add({level:5,topic:'mixed-boss',difficulty:4,type:'numeric',badge:'NIVEL 5 · DETERMINANTE POR PROPIEDADES',prompt:`Sea ${math(String.raw`A=${mtex(A)}`)}. La matriz ${math('B')} se obtiene multiplicando la primera fila de ${math('A')} por ${math('-2')} e intercambiando luego las filas segunda y tercera. Determine ${math(String.raw`\det(B)`)}.`,answerValue:ans,hint:'Multiplicar una fila por \\(-2\\) multiplica el determinante por \\(-2\\); intercambiar filas cambia el signo.',explanation:`Como ${math(String.raw`\det(A)=55`)}, se tiene ${math(String.raw`\det(B)=(-2)(-1)(55)=110`)}.`,visual:{kind:'determinant',A,det:d},instruction:'Encadena correctamente dos propiedades del determinante.'});
    }
    {
      const M=[[1,2,-1,1],[2,4,-2,2],[-1,-2,1,-1]];
      add({level:5,topic:'gauss-boss',difficulty:4,type:'tf',badge:'NIVEL 5 · CONSISTENCIA',prompt:`El sistema representado por ${math(atex(M))} tiene una única solución.`,answer:false,hint:'Observa que las filas son proporcionales.',explanation:'Las ecuaciones son equivalentes; hay variables libres y, por tanto, infinitas soluciones.',visual:{kind:'augmented',matrix:M},instruction:'Clasifica el sistema antes de entrar al portal.'});
    }
    {
      const M=[[1,2,-1,1],[2,5,1,6],[-1,-1,4,3]];
      const correct=String.raw`R_2\leftarrow R_2-2R_1`;
      const choices=[String.raw`R_2\leftarrow R_2+2R_1`,String.raw`R_3\leftarrow R_3-R_1`,String.raw`R_1\leftarrow R_1-2R_2`,String.raw`R_2\leftarrow 2R_2-R_1`,String.raw`R_1\leftrightarrow R_3`];
      add({level:5,topic:'gauss-boss',difficulty:5,type:'operation',badge:'NIVEL 5 · GAUSS–JORDAN',prompt:`Para iniciar una reducción eficiente de ${math(atex(M))}, seleccione la operación que anula la entrada ${math('2')} de la posición ${math('(2,1)')}.`,...comboOptions(math(correct),choices.map(math),shuffle),hint:'Usa la primera fila como pivote sin modificarla.',explanation:`La operación es ${math(correct)}.`,visual:{kind:'gauss',matrix:M,op:'R2 <- R2 - 2R1'},instruction:'Ejecuta la primera maniobra del protocolo final.'});
    }
    {
      const A=[[1,2,0],[0,1,3],[2,0,1]],B=[[2,1],[1,0],[3,-1]],ans=10;
      add({level:5,topic:'mixed-boss',difficulty:5,type:'numeric',badge:'NIVEL 5 · PRODUCTO RECTANGULAR',prompt:`Sean ${math(String.raw`A=${mtex(A)}`)} y ${math(String.raw`B=${mtex(B)}`)}. Determine la entrada ${math(String.raw`(AB)_{21}`)}.`,answerValue:ans,hint:'Multiplica la segunda fila de \\(A\\) por la primera columna de \\(B\\).',explanation:`${display(String.raw`(AB)_{21}=0(2)+1(1)+3(3)=10.`)}`,visual:{kind:'matrixMultiply',A,B,C:[[4,1],[10,-3],[7,1]]},instruction:'Calcula la entrada crítica del producto rectangular.'});
    }
    {
      const M=[[1,1,1,6],[2,-1,3,9],[-1,4,1,10]],sol=[1,2,3];
      add({level:5,topic:'gauss-boss',difficulty:5,type:'numeric',badge:'NIVEL 5 · SISTEMA 3×3',prompt:`Resuelva el sistema representado por ${math(atex(M))}. Ingrese el valor de ${math(String.raw`x+2y+3z`)}.`,answerValue:14,hint:'Reduzca la matriz aumentada hasta obtener los tres pivotes.',explanation:`La solución es ${math(String.raw`(x,y,z)=(1,2,3)`)} y ${math(String.raw`x+2y+3z=14`)}.`,visual:{kind:'gauss',matrix:M},instruction:'Completa el cálculo antes de enfrentar a los jefes.'});
    }
    {
      const x=25,y=25,z=50;
      add({level:5,topic:'gauss-boss',difficulty:5,type:'numeric',badge:'NIVEL 5 · MODELO DE INVERSIÓN',prompt:`Se invierten ${math('100')} millones en tres alternativas con tasas de ${math('4\%')}, ${math('6\%')} y ${math('9\%')}. El rendimiento total es ${math('7')} millones y la tercera inversión es el doble de la primera. Determine la cantidad invertida en la segunda alternativa.`,answerValue:y,hint:'Plantea un sistema con capital total, rendimiento y la relación entre la primera y la tercera inversión.',explanation:`El sistema produce ${math(String.raw`(x,y,z)=(25,25,50)`)}; la segunda inversión es ${math('25')} millones.`,instruction:'Resuelve el modelo financiero de tres variables.'});
    }

    return qs;
  }

  function buildBlackHole(seed){
    const {shuffle}=makeContext((seed||0)^0x9E3779B9);let id=1001;const qs=[];const add=q=>qs.push({id:id++,advanced:true,...q});
    add({level:1,topic:'v2d-geometry',difficulty:4,type:'numeric',badge:'PORTAL · PROYECCIÓN Y NORMA',prompt:`Sean ${math(String.raw`\mathbf u=(9,7)`)} y ${math(String.raw`\mathbf v=(2,1)`)}. Calcule ${math(String.raw`3\left\|\mathbf u-\operatorname{proj}_{\mathbf v}(\mathbf u)\right\|^2+\mathbf u\cdot\mathbf v`)}.`,answerValue:40,hint:'Calcula primero la proyección exacta; después evalúa la norma al cuadrado y el producto punto.',explanation:`${math(String.raw`\operatorname{proj}_{\mathbf v}(\mathbf u)=(10,5)`)}; así, ${math(String.raw`\mathbf u-\operatorname{proj}_{\mathbf v}(\mathbf u)=(-1,2)`)} y el valor solicitado es ${math('40')}.`,visual:{kind:'projection',a:[9,7],b:[2,1],proj:[10,5]},instruction:'Resuelve el cálculo exacto para controlar el portal.'});
    add({level:2,topic:'v3d-dot',difficulty:4,type:'numeric',badge:'PORTAL · PARÁMETRO 3D',prompt:`El vector ${math(String.raw`\mathbf u=(k,2,-1)`)} es perpendicular a ${math(String.raw`\mathbf v=(3,-2,5)`)}. Determine ${math('k')}.`,answerValue:3,hint:'Iguala el producto punto a cero.',explanation:`${math(String.raw`3k-4-5=0`)}, de donde ${math(String.raw`k=3`)}.`,instruction:'Ajusta el parámetro tridimensional del salto.'});
    add({level:3,topic:'m22-ops',difficulty:4,type:'numeric',badge:'PORTAL · POTENCIA MATRICIAL',prompt:`Sea ${math(String.raw`A=\begin{bmatrix}1&2\\0&1\end{bmatrix}`)}. Determine la entrada ${math(String.raw`(A^{12})_{12}`)}.`,answerValue:24,hint:'Identifica el patrón de las potencias de una matriz triangular de Jordan.',explanation:`${math(String.raw`A^n=\begin{bmatrix}1&2n\\0&1\end{bmatrix}`)}, así que la entrada es ${math('24')}.`,visual:{kind:'matrixMultiply',A:[[1,2],[0,1]],B:[[1,2],[0,1]],C:[[1,24],[0,1]]},instruction:'Predice la duodécima iteración del módulo.'});
    add({level:4,topic:'m33-systems',difficulty:5,type:'numeric',badge:'PORTAL · DETERMINANTE',prompt:`Sea ${math(String.raw`A\in M_{3\times3}`)} con ${math(String.raw`\det(A)=-4`)}. La matriz ${math('B')} se obtiene de ${math('A')} multiplicando dos filas por ${math('3')} e intercambiándolas. Determine ${math(String.raw`\det(B)`)}.`,answerValue:36,hint:'Dos escalas multiplican por \\(3^2\\); un intercambio multiplica por \\(-1\\).',explanation:`${math(String.raw`\det(B)=3^2(-1)(-4)=36`)}.`,instruction:'Encadena tres propiedades sin expandir matrices.'});
    add({level:5,topic:'gauss-boss',difficulty:5,type:'roman',badge:'PORTAL FINAL · AFIRMACIONES',prompt:`Considere un sistema cuadrado ${math(String.raw`A\mathbf x=\mathbf b`)} de orden tres. Son correctas:<ol class="roman-list" type="I"><li>Si ${math(String.raw`\det(A)\ne0`)}, la solución es única.</li><li>Una fila ${math(String.raw`[0\;0\;0\mid1]`)} implica inconsistencia.</li><li>Si ${math(String.raw`\det(A)=0`)}, el sistema siempre tiene infinitas soluciones.</li><li>Cramer solo es aplicable cuando ${math(String.raw`\det(A)\ne0`)}.</li></ol>`,...comboOptions('I, II y IV',['I y II','II y III','I, III y IV','II, III y IV','Todas'],shuffle),hint:'Un determinante cero también puede corresponder a un sistema sin solución.',explanation:'I, II y IV son correctas.',instruction:'Valida los criterios antes del salto final.'});
    return qs;
  }

  function buildBoss(seed){
    const {shuffle}=makeContext((seed||0)^0xC2B2AE35);let id=2001;const qs=[];const add=q=>qs.push({id:id++,boss:true,...q});

    add({level:1,difficulty:5,type:'numeric',badge:'JEFE NIVEL 1 · SISTEMA VECTORIAL',prompt:`Determine ${math(String.raw`a+b`)} si ${display(String.raw`a(1,2)+b(3,-1)=(11,1).`)}`,answerValue:5,hint:'Iguala componentes y resuelve el sistema de dos ecuaciones.',explanation:`Se obtiene ${math(String.raw`a=2`)} y ${math(String.raw`b=3`)}, así que ${math(String.raw`a+b=5`)}.`,instruction:'Rompe el escudo del jefe resolviendo ambos parámetros.'});
    add({level:1,difficulty:5,type:'numeric',badge:'JEFE NIVEL 1 · FUERZA RESULTANTE',prompt:`Dos cables ejercen ${math(String.raw`\mathbf F_1=(120,50)`)} N y ${math(String.raw`\mathbf F_2=(-30,90)`)} N. Calcule el valor entero de ${math(String.raw`\|\mathbf F_1+\mathbf F_2\|^2`)}.`,answerValue:27700,hint:'Suma las fuerzas y calcula el cuadrado de la norma del resultado.',explanation:`La resultante es ${math(String.raw`(90,140)`)} y ${math(String.raw`\|(90,140)\|^2=90^2+140^2=27700`)}.`,visual:{kind:'vectors',u:[120,50],v:[-30,90],result:[90,140]},instruction:'Calcula la intensidad cuadrática exacta para perforar el blindaje.'});
    add({level:1,difficulty:5,type:'roman',badge:'JEFE NIVEL 1 · IDENTIDADES',prompt:`Sean ${math(String.raw`\|\mathbf u\|=5`)}, ${math(String.raw`\|\mathbf v\|=8`)} y ${math(String.raw`\mathbf u\cdot\mathbf v=20`)}. Son correctas:<ol class="roman-list" type="I"><li>${math(String.raw`\cos\theta=\tfrac12`)}</li><li>${math(String.raw`\theta=60^\circ`)}</li><li>${math(String.raw`\|\mathbf u-\mathbf v\|=7`)}</li><li>${math(String.raw`\|\mathbf u+\mathbf v\|^2=129`)}</li></ol>`,...comboOptions('Todas',['I y II','I, II y III','II y IV','I, III y IV','II, III y IV'],shuffle),hint:'Use las identidades de norma del sumando y la diferencia.',explanation:'Las cuatro afirmaciones son correctas: \\(\\cos\\theta=1/2\\), \\(\\theta=60^\\circ\\), \\(\\|\\mathbf u-\\mathbf v\\|=7\\) y \\(\\|\\mathbf u+\\mathbf v\\|^2=129\\).',instruction:'Revisa cuidadosamente las cuatro afirmaciones antes de disparar.'});

    add({level:2,difficulty:5,type:'numeric',badge:'JEFE NIVEL 2 · PROYECCIÓN 3D',prompt:`Sean ${math(String.raw`\mathbf u=(4,-1,5)`)} y ${math(String.raw`\mathbf v=(2,1,-2)`)}. Calcule el numerador de la primera componente de ${math(String.raw`\operatorname{proj}_{\mathbf v}(\mathbf u)`)} cuando se expresa con denominador ${math(String.raw`\|\mathbf v\|^2`)}.`,answerValue:-6,hint:'El numerador es \\((\\mathbf u\\cdot\\mathbf v)v_1\\).',explanation:`${math(String.raw`\mathbf u\cdot\mathbf v=-3`)} y el numerador solicitado es ${math(String.raw`-3(2)=-6`)}.`,instruction:'Calcula el componente exacto del vector de ataque.'});
    add({level:2,difficulty:5,type:'numeric',badge:'JEFE NIVEL 2 · DISTANCIA Y TRABAJO',prompt:`Una nave pasa de ${math(String.raw`P=(1,-2,3)`)} a ${math(String.raw`Q=(5,1,-1)`)} bajo la fuerza ${math(String.raw`\mathbf F=(2,-1,4)`)}. Calcule el trabajo ${math(String.raw`\mathbf F\cdot\overrightarrow{PQ}`)}.`,answerValue:-11,hint:'Forme primero \\(\\overrightarrow{PQ}=Q-P\\).',explanation:`${math(String.raw`\overrightarrow{PQ}=(4,3,-4)`)} y el trabajo es ${math(String.raw`2(4)-1(3)+4(-4)=-11`)}.`,instruction:'Integra desplazamiento y fuerza en un solo cálculo.'});
    add({level:2,difficulty:5,type:'tf',badge:'JEFE NIVEL 2 · ORTOGONALIDAD',prompt:`Si ${math(String.raw`\mathbf u=(1,2,-1)`)} y ${math(String.raw`\mathbf v=(2,-1,0)`)}, entonces ${math(String.raw`\|\mathbf u+\mathbf v\|^2=\|\mathbf u\|^2+\|\mathbf v\|^2`)}.`,answer:true,hint:'La igualdad de Pitágoras equivale a ortogonalidad.',explanation:`Como ${math(String.raw`\mathbf u\cdot\mathbf v=0`)}, la igualdad es verdadera.`,instruction:'Reconoce la identidad geométrica del escudo.'});

    add({level:3,difficulty:5,type:'numeric',badge:'JEFE NIVEL 3 · ECUACIÓN MATRICIAL',prompt:`Sea ${math(String.raw`3X-2A=B`)}, con ${math(String.raw`A=\begin{bmatrix}1&2\\-1&4\end{bmatrix}`)} y ${math(String.raw`B=\begin{bmatrix}5&-2\\7&1\end{bmatrix}`)}. Calcule ${math(String.raw`9x_{22}-3x_{12}`)}.`,answerValue:25,hint:'Despeje \\(X=\\frac13(B+2A)\\) y extraiga las dos entradas.',explanation:`${math(String.raw`x_{22}=3`)} y ${math(String.raw`x_{12}=\tfrac23`)}, por lo que ${math(String.raw`9x_{22}-3x_{12}=25`)}.`,instruction:'Resuelve la ecuación matricial antes de atacar.'});
    add({level:3,difficulty:5,type:'numeric',badge:'JEFE NIVEL 3 · PRODUCTOS EN ORDEN',prompt:`Sean ${math(String.raw`A=\begin{bmatrix}1&2\\0&-1\end{bmatrix}`)} y ${math(String.raw`B=\begin{bmatrix}3&1\\2&4\end{bmatrix}`)}. Calcule ${math(String.raw`\operatorname{tr}(AB-BA)`)}.`,answerValue:0,hint:'La traza de un conmutador \\(AB-BA\\) es cero; también puede verificarse directamente.',explanation:`${math(String.raw`\operatorname{tr}(AB)=\operatorname{tr}(BA)`)}; el resultado es ${math('0')}.`,instruction:'Detecta una invariancia oculta del producto matricial.'});
    add({level:3,difficulty:5,type:'roman',badge:'JEFE NIVEL 3 · PROPIEDADES',prompt:`Sean ${math(String.raw`A,B\in M_{3\times3}`)}. Son correctas:<ol class="roman-list" type="I"><li>${math(String.raw`(AB)^T=B^TA^T`)}</li><li>Si \(A\) y \(B\) son diagonales, \(AB\) es diagonal.</li><li>Si \(AB=0\), entonces \(A=0\) o \(B=0\).</li><li>Si \(A^2=A\), entonces \((I-A)^2=I-A\).</li></ol>`,...comboOptions('I, II y IV',['I y II','II y III','I, III y IV','II, III y IV','Todas'],shuffle),hint:'Busque un contraejemplo para la afirmación III.',explanation:'I, II y IV son correctas.',instruction:'Distingue propiedades estructurales del álgebra matricial.'});

    add({level:4,difficulty:6,type:'numeric',badge:'JEFE NIVEL 4 · DETERMINANTE ENCADENADO',prompt:`Sea ${math(String.raw`A\in M_{3\times3}`)} con ${math(String.raw`\det(A)=-4`)}. La matriz ${math('B')} se obtiene de ${math('A')} multiplicando la primera fila por ${math('-2')}, la segunda por ${math('3')} e intercambiando después las filas primera y tercera. Determine ${math(String.raw`\det(B)`)}.`,answerValue:-24,hint:'Multiplique los factores asociados a cada operación elemental.',explanation:`${math(String.raw`\det(B)=(-2)(3)(-1)(-4)=-24`)}.`,instruction:'Encadena tres operaciones sin expandir ningún determinante.'});
    add({level:4,difficulty:6,type:'numeric',badge:'JEFE NIVEL 4 · CONSISTENCIA PARAMÉTRICA',prompt:`Determine ${math('k')} para que la matriz aumentada ${math(String.raw`\left[\begin{array}{cc|c}1&2&3\\2&4&k\end{array}\right]`)} represente un sistema consistente.`,answerValue:6,hint:'La segunda fila de coeficientes es dos veces la primera.',explanation:`Para evitar una contradicción se necesita ${math(String.raw`k=2(3)=6`)}.`,visual:{kind:'augmented',matrix:[[1,2,3],[2,4,6]]},instruction:'Encuentra el único valor que evita la inconsistencia.'});
    add({level:4,difficulty:6,type:'operation',badge:'JEFE NIVEL 4 · GAUSS–JORDAN',prompt:`En ${math(String.raw`\left[\begin{array}{ccc|c}1&2&-1&1\\2&5&1&6\\-1&-1&4&3\end{array}\right]`)}, después de aplicar ${math(String.raw`R_2\leftarrow R_2-2R_1`)}, ¿qué operación elimina la entrada ${math('-1')} de la posición ${math('(3,1)')}?`,...comboOptions(math(String.raw`R_3\leftarrow R_3+R_1`),[math(String.raw`R_3\leftarrow R_3-R_1`),math(String.raw`R_1\leftarrow R_1+R_3`),math(String.raw`R_3\leftarrow -R_3+R_1`),math(String.raw`R_1\leftrightarrow R_3`),math(String.raw`R_3\leftarrow R_3+2R_1`)],shuffle),hint:'Sume la fila pivote a la tercera fila.',explanation:`La operación correcta es ${math(String.raw`R_3\leftarrow R_3+R_1`)}.`,visual:{kind:'gauss',matrix:[[1,2,-1,1],[0,1,3,4],[-1,-1,4,3]]},instruction:'Ejecuta el segundo paso correcto de la reducción.'});

    add({level:5,difficulty:7,type:'numeric',badge:'JEFE FINAL ALFA · SISTEMA 3×3',prompt:`Resuelva ${display(String.raw`\begin{cases}x+y+z=60,\\2x+3y+z=140,\\x+2y+4z=120.\end{cases}`)} Calcule ${math(String.raw`2x+y+3z`)}.`,answerValue:100,hint:'Use Gauss–Jordan; la solución es entera.',explanation:`La solución es ${math(String.raw`(x,y,z)=(20,30,10)`)} y el valor solicitado es ${math('100')}.`,instruction:'Resuelve completamente el sistema que protege al jefe Alfa.'});
    add({level:5,difficulty:7,type:'numeric',badge:'JEFE FINAL ALFA · DETERMINANTE Y PRODUCTO',prompt:`Sean ${math(String.raw`A=\begin{bmatrix}1&2&0\\-1&3&1\\2&0&4\end{bmatrix}`)} y ${math(String.raw`B=\begin{bmatrix}2&0&1\\1&-1&2\\0&3&1\end{bmatrix}`)}. Calcule ${math(String.raw`\det(AB)`)}.`,answerValue:-264,hint:'Use \\(\\det(AB)=\\det(A)\\det(B)\\) y calcule dos determinantes 3×3.',explanation:`${math(String.raw`\det(A)=24`)} y ${math(String.raw`\det(B)=-11`)}, por tanto ${math(String.raw`\det(AB)=-264`)}.`,instruction:'Calcula dos determinantes antes de abrir fuego.'});
    add({level:5,difficulty:7,type:'roman',badge:'JEFE FINAL BETA · SISTEMAS',prompt:`Considere el sistema ${math(String.raw`A\mathbf x=\mathbf b`)} de orden tres. Son correctas:<ol class="roman-list" type="I"><li>Si la RREF contiene una fila ${math(String.raw`[0\ 0\ 0\mid c]`)} con ${math(String.raw`c\ne0`)}, no hay solución.</li><li>Si hay tres pivotes en las columnas de variables, la solución es única.</li><li>Si ${math(String.raw`\det(A)=0`)}, necesariamente hay infinitas soluciones.</li><li>Si una variable es libre y el sistema es consistente, hay infinitas soluciones.</li></ol>`,...comboOptions('I, II y IV',['I y II','II y III','I, III y IV','II, III y IV','Todas'],shuffle),hint:'Un determinante cero puede dar infinitas soluciones o ninguna.',explanation:'I, II y IV son correctas.',instruction:'Clasifica todos los escenarios antes de localizar al jefe Beta.'});
    add({level:5,difficulty:7,type:'numeric',badge:'JEFE FINAL BETA · MODELO DE RECURSOS',prompt:`Una empresa produce tres artículos. Los consumos por unidad son las columnas de ${math(String.raw`A=\begin{bmatrix}2&1&3\\1&3&2\\4&2&1\end{bmatrix}`)} y las disponibilidades son ${math(String.raw`\mathbf b=(220,210,190)^T`)}. Resuelva ${math(String.raw`A\mathbf x=\mathbf b`)} y calcule ${math(String.raw`x_1+x_2+x_3`)}.`,answerValue:100,hint:'Reduzca la matriz aumentada de orden tres.',explanation:`La solución es ${math(String.raw`(x_1,x_2,x_3)=(20,30,50)`)} y la suma es ${math('100')}.`,visual:{kind:'augmented',matrix:[[2,1,3,220],[1,3,2,210],[4,2,1,190]]},instruction:'Calcula el plan de producción para desactivar el último núcleo.'});

    return qs;
  }

  global.NVQuestions={build,buildBlackHole,buildBoss};
})(window);
