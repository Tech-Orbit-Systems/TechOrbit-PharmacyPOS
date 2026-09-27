const {CashClosingService}=require('./cash-closing');

class SixMonthClosingService {
  constructor(db){this.db=db;this.cash=new CashClosingService(db)}
  manager(userId){const code=this.cash.actorRole(userId);if(!['manager','admin'].includes(code))throw new Error('Manager permission is required for six-month closing')}
  cycle(cycleStart){
    if(!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(String(cycleStart||'')))throw new Error('Choose the first day of a six-month cycle');
    const [year,month]=cycleStart.split('-').map(Number),anchor=this.cash.policy().sixMonthCycleStartMonth;
    if((month-anchor+12)%6!==0)throw new Error('Cycle start does not match this pharmacy configuration');
    const from=new Date(Date.UTC(year,month-1,1)-5*3600000);
    const to=new Date(Date.UTC(year,month+5,1)-5*3600000);
    if(to.getTime()>Date.now())throw new Error('Six-month cycle is not complete yet');
    return {from:from.toISOString(),to:to.toISOString(),cycleStart,cycleEnd:new Date(to.getTime()-1+5*3600000).toISOString().slice(0,10),cycleStartMonth:anchor};
  }
  latestCompletedCycle(){
    const current=this.cash.cycleBounds(new Date().toISOString());
    const local=new Date(Date.parse(current.start)+5*3600000);
    const previous=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth()-6,1));
    return this.cycle(previous.toISOString().slice(0,7)+'-01');
  }
  preview(input={}){
    const cycle=input.cycleStart?this.cycle(input.cycleStart):this.latestCompletedCycle();
    return {...this.cash.rangeReport(cycle.from,cycle.to),cycleStart:cycle.cycleStart,cycleEnd:cycle.cycleEnd};
  }
  close(input){
    this.manager(input?.userId);
    if(!input?.cycleStart)throw new Error('Select the completed pharmacy cycle before official close');
    return this.db.transaction(()=>{
      const cycle=this.cycle(input.cycleStart);
      const overlap=this.db.prepare(`SELECT id FROM PeriodClosings WHERE period_type='six_month'
        AND period_start<=? AND period_end>=? LIMIT 1`).get(cycle.cycleEnd,cycle.cycleStart);
      if(overlap)throw new Error('This six-month cycle overlaps an existing official close');
      const open=this.db.prepare("SELECT 1 FROM BusinessDays WHERE status='open' AND julianday(opened_at)<julianday(?) LIMIT 1").get(cycle.to);
      if(open)throw new Error('Close overlapping business days before six-month close');
      const report={...this.cash.rangeReport(cycle.from,cycle.to),cycleStart:cycle.cycleStart,cycleEnd:cycle.cycleEnd};
      const now=new Date().toISOString(),notes=String(input.notes||'').trim()||null;
      const id=Number(this.db.prepare(`INSERT INTO PeriodClosings(period_type,period_start,period_end,totals_json,closed_at,closed_by,notes)
        VALUES('six_month',?,?,?,?,?,?)`).run(cycle.cycleStart,cycle.cycleEnd,JSON.stringify(report.totals),now,input.userId,notes).lastInsertRowid);
      this.db.prepare('INSERT INTO PeriodClosingDetails(period_closing_id,from_utc,to_utc,cycle_start_month,report_json) VALUES(?,?,?,?,?)')
        .run(id,cycle.from,cycle.to,cycle.cycleStartMonth,JSON.stringify(report));
      this.audit('six_month.close',id,input.userId,report,notes);
      return {closingId:id,closedAt:now,...report};
    })();
  }
  history(){
    return this.db.prepare(`SELECT p.id,p.period_start,p.period_end,p.closed_at,p.closed_by,
      CASE WHEN d.period_closing_id IS NULL THEN 1 ELSE 0 END legacy
      FROM PeriodClosings p LEFT JOIN PeriodClosingDetails d ON d.period_closing_id=p.id
      WHERE p.period_type='six_month' ORDER BY p.period_start DESC,p.id DESC`).all()
      .map(row=>({...row,revisionCount:this.db.prepare('SELECT COUNT(*) count FROM PeriodClosingRevisions WHERE period_closing_id=?').get(row.id).count}));
  }
  detail(id){
    const row=this.db.prepare(`SELECT p.*,d.report_json FROM PeriodClosings p
      LEFT JOIN PeriodClosingDetails d ON d.period_closing_id=p.id WHERE p.id=? AND p.period_type='six_month'`).get(id);
    if(!row)throw new Error('Six-month closing was not found');
    if(!row.report_json)return {closingId:row.id,legacy:true,periodStart:row.period_start,periodEnd:row.period_end,originalTotals:JSON.parse(row.totals_json),revisions:[]};
    const revisions=this.db.prepare('SELECT revision_number,reason,revised_at,revised_by,report_json FROM PeriodClosingRevisions WHERE period_closing_id=? ORDER BY revision_number').all(id);
    return {closingId:row.id,legacy:false,original:JSON.parse(row.report_json),current:JSON.parse(revisions.at(-1)?.report_json||row.report_json),
      revisions:revisions.map(({report_json,...metadata})=>metadata)};
  }
  revise(input){
    this.manager(input?.userId);
    const reason=String(input?.reason||'').trim();if(!reason)throw new Error('Six-month revision requires a reason');
    return this.db.transaction(()=>{
      const detail=this.detail(input.closingId);
      if(detail.legacy)throw new Error('Legacy period snapshot needs independent reconciliation before revision');
      const previous=detail.current;
      const corrected=this.cash.rangeReport(previous.from,previous.asOf);
      if(JSON.stringify(previous.totals)===JSON.stringify(corrected.totals))throw new Error('No financial change exists to revise');
      const report={...corrected,cycleStart:previous.cycleStart,cycleEnd:previous.cycleEnd};
      const number=detail.revisions.length+1,now=new Date().toISOString();
      this.db.prepare(`INSERT INTO PeriodClosingRevisions(period_closing_id,revision_number,previous_report_json,report_json,reason,revised_at,revised_by)
        VALUES(?,?,?,?,?,?,?)`).run(input.closingId,number,JSON.stringify(previous),JSON.stringify(report),reason,now,input.userId);
      this.audit('six_month.revise',input.closingId,input.userId,report,reason);
      return {closingId:input.closingId,revisionNumber:number,...report};
    })();
  }
  audit(action,id,userId,next,reason){
    this.db.prepare(`INSERT INTO AuditLog(occurred_at,user_id,action,entity_type,entity_id,new_json,reason)
      VALUES(?,?,?,'period_closing',?,?,?)`).run(new Date().toISOString(),userId,action,String(id),JSON.stringify(next),reason||null);
  }
}
module.exports={SixMonthClosingService};
