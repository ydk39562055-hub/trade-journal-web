package com.yun.tradejournal;

import android.app.*;
import android.content.*;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.webkit.*;
import android.widget.*;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.*;

public final class MainActivity extends Activity {
    private static final String JOURNAL="https://ydk39562055-hub.github.io/trade-journal-web/";
    private LinearLayout layout; private EditText code; private TextView status; private WebView web;
    private ValueCallback<Uri[]> files;
    private final android.os.Handler statusHandler=new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable refreshStatus=new Runnable(){public void run(){
        if(web==null && status!=null) status.setText(JournalStore.prefs(MainActivity.this).getString("status","알림 수신 대기"));
        statusHandler.postDelayed(this,2000);
    }};
    @Override public void onCreate(Bundle state) { super.onCreate(state); showSettings(); }
    @Override protected void onResume() { super.onResume();statusHandler.post(refreshStatus); }
    @Override protected void onPause() { statusHandler.removeCallbacks(refreshStatus);super.onPause(); }
    private TextView text(String value,int size) { TextView t=new TextView(this); t.setText(value); t.setTextSize(size); t.setPadding(0,14,0,14); layout.addView(t); return t; }
    private void button(String label, View.OnClickListener action) { Button b=new Button(this); b.setText(label); b.setOnClickListener(action); layout.addView(b); }
    private void showSettings() {
        web=null;
        ScrollView scroll=new ScrollView(this); layout=new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(30,45,30,40); scroll.addView(layout); setContentView(scroll);
        var prefs=JournalStore.prefs(this);
        text("나의 거래일지",25);
        text("토스 자동 기록과 메리츠 체결 알림을 모아 봐요. 메리츠 알림은 선택한 앱의 매매 관련 내용만 수집하고, 내 거래일지 저장소에 동기화해요.",15);
        button("거래일지 열기",v->openJournal());
        text("1. 자동 기록 연결",19);
        code=new EditText(this); code.setHint("자동 기록 연결코드"); code.setSingleLine(true); code.setInputType(129); code.setText(prefs.getString("code","")); layout.addView(code);
        button("연결 파일 선택",v->{ Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT); i.setType("application/json"); i.addCategory(Intent.CATEGORY_OPENABLE); startActivityForResult(i,101); });
        button("연결코드 저장",v->saveCode(code.getText().toString()));
        text("2. 메리츠 앱 선택",19);
        List<ResolveInfo> apps=getPackageManager().queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),0);
        List<ResolveInfo> meritz=new ArrayList<>(); Set<String> seen=new HashSet<>();
        for(ResolveInfo app:apps) { String label=app.loadLabel(getPackageManager()).toString(); String p=app.activityInfo.packageName;
            String hint=(label+" "+p).toLowerCase(Locale.ROOT);
            if((hint.contains("메리츠")||hint.contains("모움")||hint.contains("meritz")||hint.contains("moum")) && seen.add(p)) meritz.add(app);
        }
        if(meritz.isEmpty()) text("설치된 메리츠 앱을 찾지 못했어요. 메리츠 앱 설치 후 다시 열어 주세요.",14);
        for(ResolveInfo app:meritz) { RadioButton b=new RadioButton(this); String p=app.activityInfo.packageName;
            b.setText(app.loadLabel(getPackageManager())); b.setChecked(p.equals(prefs.getString("package","")));
            b.setOnClickListener(v->{prefs.edit().putString("package",p).apply();showSettings();}); layout.addView(b);
        }
        text("3. 알림 접근 허용",19);
        text("안드로이드 설정에서 거래일지의 알림 접근을 허용해 주세요. 허용 후 새로 도착하는 메리츠 알림부터 받을 수 있어요. 과거 알림은 거래내역 캡처로 가져올 수 있어요.",14);
        button("알림 접근 설정 열기",v->startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        Switch enabled=new Switch(this); enabled.setText("메리츠 매매 알림 수집"); enabled.setChecked(prefs.getBoolean("enabled",false)); layout.addView(enabled);
        enabled.setOnCheckedChangeListener((b,value)->{if(value&&(prefs.getString("package","").isEmpty()||prefs.getString("code","").isEmpty())) {
            b.setChecked(false);Toast.makeText(this,"연결코드와 메리츠 앱을 먼저 선택해 주세요.",Toast.LENGTH_LONG).show();return;}
            prefs.edit().putBoolean("enabled",value).apply(); if(value) {SyncJob.schedule(this);Uploader.request(this);} });
        status=text(prefs.getString("status","알림 수신 대기"),14);
        button("동기화 다시 시도",v->{Uploader.request(this);Toast.makeText(this,"동기화를 요청했어요.",Toast.LENGTH_SHORT).show();});
        button("연결 해제",v->{prefs.edit().remove("code").putBoolean("enabled",false).apply();showSettings();});
    }
    private void saveCode(String raw) {
        String value=raw.replaceAll("[\\s-]","");
        if(!value.matches("(?i)TJBF[0-9a-f]{64}")) { Toast.makeText(this,"자동 기록 연결코드를 확인해 주세요.",Toast.LENGTH_LONG).show(); return; }
        value="TJBF"+value.substring(4).toLowerCase(Locale.ROOT);JournalStore.prefs(this).edit().putString("code",value).apply();code.setText(value);
        Toast.makeText(this,"연결 설정을 저장했어요.",Toast.LENGTH_SHORT).show();
    }
    private void openJournal() {
        LinearLayout box=new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); Button settings=new Button(this); settings.setText("알림 수집 설정");settings.setOnClickListener(v->showSettings());box.addView(settings);
        web=new WebView(this);web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebViewClient(new WebViewClient(){
            public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
                String url=request.getUrl().toString();if(url.startsWith(JOURNAL)) return false;
                if(url.startsWith("https://")) startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl()));return true;
            }
            public void onPageFinished(WebView view,String url) {
                String saved=JournalStore.prefs(MainActivity.this).getString("code","");
                if(!url.startsWith(JOURNAL)||saved.isEmpty())return;
                view.evaluateJavascript("(function(){try{var s=JSON.parse(localStorage.getItem('tj_settings_v2')||'{}');var c="+JSONObject.quote(saved)+";if(s.brokerFeedCode!==c){s.brokerFeedCode=c;localStorage.setItem('tj_settings_v2',JSON.stringify(s));localStorage.setItem('tj_tab','broker');location.reload();}}catch(e){}})()",null);
            }
        });
        web.setWebChromeClient(new WebChromeClient(){
            public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> result,FileChooserParams params) {
                if(files!=null)files.onReceiveValue(null);files=result;
                try {startActivityForResult(params.createIntent(),102);return true;} catch(Exception e){files=null;return false;}
            }
            public boolean onJsAlert(WebView view,String url,String message,JsResult result) {new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("확인",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;}
        });
        box.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(box);web.loadUrl(JOURNAL);
    }
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if(request==102&&files!=null){files.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));files=null;return;}
        if(request==101&&result==RESULT_OK&&data!=null) try(var stream=getContentResolver().openInputStream(data.getData())) {
            java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[1024];int n;
            while((n=stream.read(buffer))!=-1){out.write(buffer,0,n);if(out.size()>4096)throw new Exception();}
            JSONObject j=new JSONObject(out.toString("UTF-8"));
            if(!j.getString("kind").equals("trade-journal-broker-connection"))throw new Exception();saveCode(j.getString("code"));
        } catch(Exception e){Toast.makeText(this,"자동기록 연결 JSON 파일을 선택해 주세요.",Toast.LENGTH_LONG).show();}
    }
    @Override public void onBackPressed(){if(web!=null){if(web.canGoBack())web.goBack();else showSettings();}else super.onBackPressed();}
}
