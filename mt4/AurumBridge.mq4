// Aurum bridge v1.0 — attach to XAUUSD. The dashboard is the only entry judge.
#property strict
#property version "1.00"
input int Magic = 20261013;
input double MaxRiskPercent = 1.0;
input double MaxDailyLossPercent = 3.0;
input int MaxSpreadPoints = 100;
input int SlippagePoints = 20;
input bool AllowEntries = false;
input string DxySymbol = "";
input string Us10ySymbol = "";
input int ClosedBars = 250;
string StatusFile = "Aurum_status.json";
string CommandFile = "Aurum_command.json";
string CalendarFile = "Aurum_calendar.json";
int lastId=0, lastTicket=0;
string lastResult="none", lastReason="";
string gvId, gvDay, gvEquity;
double dayEquity=0;
int dayKey=0;
datetime lastTickUTC=0;
int brokerOffset=0;
string Escape(string x){StringReplace(x,"\\","\\\\");StringReplace(x,"\"","\\\"");StringReplace(x,"\r"," ");StringReplace(x,"\n"," ");return x;}
string Bool(bool x){return x?"true":"false";}
string Num(double x,int digits=8){if(!MathIsValidNumber(x))return "0";return DoubleToString(x,digits);}
string ReadText(string name){
 int h=FileOpen(name,FILE_READ|FILE_TXT|FILE_ANSI|FILE_COMMON|FILE_SHARE_READ,0,CP_UTF8);if(h==INVALID_HANDLE)return "";
 string out="";while(!FileIsEnding(h))out+=FileReadString(h);FileClose(h);return out;
}
// Transport emits flat ASCII command objects; arbitrary strings are never executed.
string Value(string json,string key){
 int p=StringFind(json,"\""+key+"\"");if(p<0)return "";p=StringFind(json,":",p)+1;
 while(p<StringLen(json)&&StringGetCharacter(json,p)==32)p++;
 if(StringSubstr(json,p,1)=="\""){int end=StringFind(json,"\"",p+1);return end>p?StringSubstr(json,p+1,end-p-1):"";}
 int end=p;while(end<StringLen(json)&&StringSubstr(json,end,1)!=","&&StringSubstr(json,end,1)!="}")end++;
 return StringSubstr(json,p,end-p);
}
double Number(string json,string key){return StringToDouble(Value(json,key));}
void UpdateDay(){
 int day=(int)(TimeGMT()/86400);
 if(day!=dayKey){dayKey=day;dayEquity=AccountEquity();GlobalVariableSet(gvDay,dayKey);GlobalVariableSet(gvEquity,dayEquity);GlobalVariablesFlush();}
}
bool CalendarAllowed(){
 string c=ReadText(CalendarFile);double ts=Number(c,"asOf");
 return ts>0&&TimeGMT()-ts<=300&&ts-TimeGMT()<=30&&Value(c,"blocked")=="false";
}
string BarsJson(string sym,int tf){
 if(sym==""||!SymbolSelect(sym,true))return "[]";
 int count=MathMin(MathMax(ClosedBars,220),MathMin(500,iBars(sym,tf)-1));
 string out="[";int added=0;int offset=brokerOffset;
 for(int i=count;i>=1;i--){
  double op=iOpen(sym,tf,i),hi=iHigh(sym,tf,i),lo=iLow(sym,tf,i),cl=iClose(sym,tf,i);
  if(op<=0||hi<=0||lo<=0||cl<=0)continue;
  if(added++)out+=",";
  out+="{\"time\":"+IntegerToString((int)iTime(sym,tf,i)-offset)+",\"open\":"+Num(op)+",\"high\":"+Num(hi)+",\"low\":"+Num(lo)+",\"close\":"+Num(cl)+",\"volume\":"+Num((double)iVolume(sym,tf,i),0)+"}";
 }
 return out+"]";
}
string Positions(){
 string out="[";int added=0;
 for(int i=0;i<OrdersTotal();i++){
  if(!OrderSelect(i,SELECT_BY_POS,MODE_TRADES))continue;
  if(added++)out+=",";
  string kind=OrderType()==OP_BUY?"BUY":OrderType()==OP_SELL?"SELL":"PENDING";
  out+="{\"ticket\":"+IntegerToString(OrderTicket())+",\"symbol\":\""+Escape(OrderSymbol())+"\",\"type\":\""+kind+"\",\"lots\":"+Num(OrderLots())+",\"entry\":"+Num(OrderOpenPrice())+",\"sl\":"+Num(OrderStopLoss())+",\"tp\":"+Num(OrderTakeProfit())+",\"pnl\":"+Num(OrderProfit()+OrderSwap()+OrderCommission())+"}";
 }
 return out+"]";
}
void Publish(){
 RefreshRates();UpdateDay();string sym=Symbol();int offset=brokerOffset;
 string cal=ReadText(CalendarFile);if(cal=="")cal="null";
 string s="{\"source\":\"aurum-mt4-v1\",\"capturedAt\":"+IntegerToString((int)TimeGMT())+",\"connected\":"+Bool(IsConnected())+",\"tradeAllowed\":"+Bool(IsTradeAllowed()&&AllowEntries);
 s+=",\"account\":{\"login\":"+IntegerToString(AccountNumber())+",\"server\":\""+Escape(AccountServer())+"\",\"demo\":"+Bool(IsDemo())+",\"currency\":\""+Escape(AccountCurrency())+"\",\"balance\":"+Num(AccountBalance())+",\"equity\":"+Num(AccountEquity())+"}";
 s+=",\"symbol\":\""+Escape(sym)+"\",\"quote\":{\"bid\":"+Num(Bid)+",\"ask\":"+Num(Ask)+",\"point\":"+Num(Point)+",\"digits\":"+IntegerToString(Digits);
 s+=",\"tickTime\":"+IntegerToString((int)lastTickUTC)+",\"tickValue\":"+Num(MarketInfo(sym,MODE_TICKVALUE))+",\"tickSize\":"+Num(MarketInfo(sym,MODE_TICKSIZE));
 s+=",\"minLot\":"+Num(MarketInfo(sym,MODE_MINLOT))+",\"maxLot\":"+Num(MarketInfo(sym,MODE_MAXLOT))+",\"lotStep\":"+Num(MarketInfo(sym,MODE_LOTSTEP))+",\"stopPoints\":"+Num(MarketInfo(sym,MODE_STOPLEVEL))+"}";
 s+=",\"bars\":{\"D1\":"+BarsJson(sym,PERIOD_D1)+",\"H1\":"+BarsJson(sym,PERIOD_H1)+",\"M15\":"+BarsJson(sym,PERIOD_M15)+",\"M5\":"+BarsJson(sym,PERIOD_M5)+",\"M1\":"+BarsJson(sym,PERIOD_M1)+",\"W1\":"+BarsJson(sym,PERIOD_W1)+",\"DXY\":"+BarsJson(DxySymbol,PERIOD_H1)+",\"US10Y\":"+BarsJson(Us10ySymbol,PERIOD_H1)+"}";
 s+=",\"calendar\":"+cal+",\"positions\":"+Positions()+",\"lastCommand\":{\"id\":"+IntegerToString(lastId)+",\"result\":\""+lastResult+"\",\"ticket\":"+IntegerToString(lastTicket)+",\"reason\":\""+Escape(lastReason)+"\"}}";
 int h=FileOpen(StatusFile+".tmp",FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON,0,CP_UTF8);if(h==INVALID_HANDLE)return;
 FileWriteString(h,s);FileClose(h);if(!FileMove(StatusFile+".tmp",FILE_COMMON,StatusFile,FILE_REWRITE|FILE_COMMON))Print("Aurum: status publication failed ",GetLastError());
}
string Execute(string c){
 if(Value(c,"cmd")!="EXECUTE")return "Commande inconnue";
 if((int)Number(c,"login")!=AccountNumber()||Value(c,"symbol")!=Symbol())return "Compte ou symbole incorrect";
 double expires=Number(c,"expires");if(expires<TimeGMT()||expires-TimeGMT()>10)return "Commande expiree";
 if(!AllowEntries||!IsConnected()||!IsTradeAllowed())return "AutoTrading ou AllowEntries desactive";
 if(!CalendarAllowed())return "Filtre calendrier absent, perime ou bloque";
 UpdateDay();if(dayEquity<=0||AccountEquity()<=dayEquity*(1.0-MathMin(5.0,MaxDailyLossPercent)/100.0))return "Circuit breaker journalier";
 for(int i=0;i<OrdersTotal();i++)if(OrderSelect(i,SELECT_BY_POS,MODE_TRADES)&&OrderSymbol()==Symbol())return "Position ou ordre deja present";
 RefreshRates();double spread=(Ask-Bid)/Point;
 if(spread>MathMin(MaxSpreadPoints,Number(c,"maxSpreadPoints")))return "Spread trop eleve";
 int type;string side=Value(c,"side");if(side=="BUY")type=OP_BUY;else if(side=="SELL")type=OP_SELL;else return "Sens invalide";
 double entry=type==OP_BUY?Ask:Bid,sl=Number(c,"sl"),tp=Number(c,"tp"),lots=Number(c,"lots");
 double drift=Number(c,"maxDrift"),reference=Number(c,"reference");
 if(drift<=0||reference<=0||MathAbs(entry-reference)>drift)return "Prix eloigne du plan";
 double stops=(MarketInfo(Symbol(),MODE_STOPLEVEL)+1)*Point;
 if(sl<=0||tp<=0||((type==OP_BUY)&&(sl>Bid-stops||tp<Bid+stops))||((type==OP_SELL)&&(sl<Ask+stops||tp>Ask-stops)))return "SL/TP invalides";
 double dist=MathAbs(entry-sl);if(Ask-Bid>dist*0.35)return "Spread relatif trop eleve";
 double minLot=MarketInfo(Symbol(),MODE_MINLOT),maxLot=MarketInfo(Symbol(),MODE_MAXLOT),step=MarketInfo(Symbol(),MODE_LOTSTEP);
 if(step<=0||lots<minLot||lots>maxLot||MathAbs(lots/step-MathRound(lots/step))>0.000001)return "Volume invalide";
 double tv=MarketInfo(Symbol(),MODE_TICKVALUE),ts=MarketInfo(Symbol(),MODE_TICKSIZE);
 double cap=MathMin(MaxRiskPercent,Number(c,"maxRiskPercent"));
 if(tv<=0||ts<=0||cap<=0||dist/ts*tv*lots>AccountBalance()*cap/100.0+0.01)return "Budget de risque depasse";
 if(AccountFreeMarginCheck(Symbol(),type,lots)<=0)return "Marge insuffisante";
 int ticket=OrderSend(Symbol(),type,lots,entry,SlippagePoints,NormalizeDouble(sl,Digits),NormalizeDouble(tp,Digits),"Aurum "+IntegerToString(lastId),Magic,0,clrNONE);
 if(ticket<0)return "OrderSend erreur "+IntegerToString(GetLastError());
 lastTicket=ticket;lastResult="executed";return "Ordre execute ticket "+IntegerToString(ticket);
}
void ReadCommand(){
 string c=ReadText(CommandFile);if(c=="")return;
 int id=(int)Number(c,"id");
 if(id>lastId){
  // Persist before OrderSend. A crash cannot cause the same command to be resubmitted.
  lastId=id;lastTicket=0;lastResult="rejected";
  if(GlobalVariableSet(gvId,id)==0){lastReason="Checkpoint indisponible : ordre non execute";return;}
  GlobalVariablesFlush();
  lastReason=Execute(c);
 }
 FileDelete(CommandFile,FILE_COMMON);
}
int OnInit(){
 if(StringFind(Symbol(),"XAUUSD")!=0)return INIT_PARAMETERS_INCORRECT;
 if(MaxRiskPercent<=0||MaxRiskPercent>2||MaxDailyLossPercent<=0||MaxDailyLossPercent>5||MaxSpreadPoints<=0)return INIT_PARAMETERS_INCORRECT;
 string prefix="Aurum_"+IntegerToString(AccountNumber())+"_"+Symbol();
 gvId=prefix+"_cmd";gvDay=prefix+"_day";gvEquity=prefix+"_equity";
 if(GlobalVariableCheck(gvId)){lastId=(int)GlobalVariableGet(gvId);if(lastId>0){lastResult="unknown";lastReason="Terminal redemarre : verifier le dernier ordre dans MT4";}}
 if(GlobalVariableCheck(gvDay))dayKey=(int)GlobalVariableGet(gvDay);
 if(GlobalVariableCheck(gvEquity))dayEquity=GlobalVariableGet(gvEquity);
 UpdateDay();EventSetTimer(1);Publish();return INIT_SUCCEEDED;
}
void OnTimer(){ReadCommand();Publish();}
void OnTick(){lastTickUTC=TimeGMT();brokerOffset=(int)MathRound((double)(TimeCurrent()-TimeGMT())/60.0)*60;}
void OnDeinit(const int reason){EventKillTimer();}
