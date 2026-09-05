package com.yun.tradejournal;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.*;

final class JournalStore extends SQLiteOpenHelper {
    static final long SINCE = 1767193200000L; // 2026-01-01 00:00:00 Asia/Seoul
    JournalStore(Context context) { super(context, "meritz-notifications.db", null, 1); }
    public void onCreate(SQLiteDatabase db) { db.execSQL("CREATE TABLE notices(id TEXT PRIMARY KEY, posted INTEGER NOT NULL, package TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL)"); }
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { throw new IllegalStateException("Migration required"); }
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("collector", Context.MODE_PRIVATE); }
    static String hash(String value) throws Exception {
        byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder(); for(byte b: bytes) out.append(String.format("%02x", b & 255)); return out.toString();
    }
    void add(String key, long posted, String app, String title, String body) throws Exception {
        if(posted < SINCE) return;
        ContentValues v = new ContentValues(); v.put("id", hash(app + "|" + key + "|" + posted + "|" + title + "|" + body));
        v.put("posted", posted); v.put("package", app); v.put("title", title); v.put("body", body);
        getWritableDatabase().insertWithOnConflict("notices", null, v, SQLiteDatabase.CONFLICT_IGNORE);
    }
    JSONArray all() throws Exception {
        JSONArray rows = new JSONArray();
        try(Cursor c = getReadableDatabase().rawQuery("SELECT id,posted,package,title,body FROM notices WHERE posted>=? ORDER BY posted DESC,id", new String[]{Long.toString(SINCE)})) {
            while(c.moveToNext()) rows.put(new JSONObject().put("id",c.getString(0)).put("receivedAt",c.getLong(1))
                .put("packageName",c.getString(2)).put("title",c.getString(3)).put("text",c.getString(4)));
        }
        return rows;
    }
}
