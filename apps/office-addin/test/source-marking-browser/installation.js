(() => {
 const binding={chain_id:'chain-1',source_id:'doc-source-17',revision_id:'rev-4',contribution_id:'portion-2',scope_id:'0',viewer_id:'authorized-reviewer'};
 const wire=JSON.stringify({schema:'knitli.native-source-marking.v2',binding,marking:{text:'S',layers:[{tokens:[{t:'',mask:{kind:'concealed'}},{t:'S'},{t:'',mask:{kind:'unidentified'}}]}],masks:[]}});
 const state={wire,baseWire:wire,binding:{...binding},documentId:'doc-1',active:true,watch:null,delay:false,resolve:null,reads:0};
 window.smoke=state;
 window.Office={HostType:{Word:'Word'},EventType:{DocumentSelectionChanged:'selection'},context:{document:{addHandlerAsync(){}},requirements:{isSetSupported:()=>false}},onReady:async f=>{try{await f({host:'Word'})}catch(e){state.error=String(e)}}};
 window.Word={run:async f=>f({sync:async()=>{},document:{body:{paragraphs:{load:()=>({items:[]})}}}})};
 if(!location.search.includes('absent')) window.marqueOfficeSourceMarking={maxBytes:4096,activeDocumentId:async()=>state.documentId,open:async()=>({documentId:'doc-1',binding:{...binding},currentBinding:async()=>({...state.binding}),isCurrent:()=>state.active,watchInvalidation:f=>(state.watch=f,()=>{if(state.watch===f)state.watch=null}),read:async()=>{state.reads++;if(state.delay)await new Promise(r=>state.resolve=r);return state.wire}})};
})();
