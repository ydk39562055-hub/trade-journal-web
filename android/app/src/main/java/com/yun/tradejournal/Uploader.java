package com.yun.tradejournal;

import android.content.Context;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.*;
import org.json.*;

final class Uploader {
    static final ExecutorService QUEUE = Executors.newSingleThreadExecutor();
    private static final String RPC = "https://oxogtsfxdjbctzehxvae.supabase.co/rest/v1/rpc/";
    private static final String KEY = "sb_publishable_3vXShFC5dKvMqzUy1KkyGQ_sF0SzUY2";
    static void request(Context c) { QUEUE.execute(() -> sync(c)); }
    static boolean sync(Context c) {
        var prefs = JournalStore.prefs(c);
        if(!prefs.getBoolean("enabled",false)) return true;
        String code = prefs.getString("code","");
        if(!code.matches("TJBF[0-9a-f]{64}")) return false;
        try(JournalStore store = new JournalStore(c)) {
            JSONArray rows = store.all();
            String id = JournalStore.hash("trade-journal-broker-v1:meritz-notifications:" + code);
            JSONArray previous = new JSONArray(send("sync_pull", new JSONObject().put("p_sync_id",id)));
            Map<String,JSONObject> merged = new LinkedHashMap<>();
            if(previous.length()>1) throw new Exception("Invalid inbox");
            if(previous.length()==1) {
                JSONObject old = previous.getJSONObject(0).getJSONObject("data");
                if(!old.getString("kind").equals("broker-notifications") || !old.getString("source").equals("meritz")) throw new Exception("Invalid inbox");
                JSONArray remote = old.getJSONArray("rows");
                for(int i=0;i<remote.length();i++) { JSONObject row=remote.getJSONObject(i); merged.put(row.getString("id"),row); }
            }
            for(int i=0;i<rows.length();i++) { JSONObject row=rows.getJSONObject(i); merged.put(row.getString("id"),row); }
            List<JSONObject> sorted = new ArrayList<>(merged.values());
            sorted.sort((a,b)->Long.compare(b.optLong("receivedAt"),a.optLong("receivedAt")));
            rows = new JSONArray(sorted);
            JSONObject data = new JSONObject().put("kind","broker-notifications").put("version",1).put("source","meritz")
                .put("receivedSince","2026-01-01T00:00:00+09:00").put("updatedAt",System.currentTimeMillis()).put("rows",rows);
            JSONObject body = new JSONObject().put("p_sync_id",id).put("p_data",data);
            if(body.toString().length() > 4000000) throw new Exception("Size limit");
            send("sync_push",body);
            JSONArray saved = new JSONArray(send("sync_pull", new JSONObject().put("p_sync_id",id)));
            if(saved.length()!=1) throw new Exception("Verification failed");
            JSONArray confirmed = saved.getJSONObject(0).getJSONObject("data").getJSONArray("rows");
            Map<String,JSONObject> checked = new HashMap<>();
            for(int i=0;i<confirmed.length();i++) { JSONObject row=confirmed.getJSONObject(i);checked.put(row.getString("id"),row); }
            for(JSONObject row:sorted) {
                JSONObject other=checked.get(row.getString("id"));
                if(other==null || !other.getString("title").equals(row.getString("title")) || !other.getString("text").equals(row.getString("text"))
                    || other.getLong("receivedAt")!=row.getLong("receivedAt")) throw new Exception("Verification failed");
            }
            prefs.edit().putString("status", rows.length()+"건 동기화 완료").putLong("lastSync",System.currentTimeMillis()).apply();
            return true;
        } catch(Exception ignored) {
            prefs.edit().putString("status","동기화 대기 · 인터넷과 연결코드를 확인해 주세요").apply();
            return false;
        }
    }
    private static String send(String action, JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection)new URL(RPC + action).openConnection();
        try {
            connection.setInstanceFollowRedirects(false); connection.setRequestMethod("POST");
            connection.setConnectTimeout(15000); connection.setReadTimeout(15000); connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type","application/json"); connection.setRequestProperty("apikey",KEY);
            connection.setRequestProperty("Authorization","Bearer " + KEY);
            try(var stream = connection.getOutputStream()) { stream.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            if(connection.getResponseCode()!=200) throw new Exception("Cloud request failed");
            try(var stream = connection.getInputStream();var out = new java.io.ByteArrayOutputStream()) {
                byte[] buffer=new byte[8192];int n;while((n=stream.read(buffer))!=-1){out.write(buffer,0,n);if(out.size()>8000000)throw new Exception("Response size");}
                return out.toString("UTF-8");
            }
        } finally { connection.disconnect(); }
    }
}
