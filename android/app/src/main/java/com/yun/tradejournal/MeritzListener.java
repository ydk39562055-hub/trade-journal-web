package com.yun.tradejournal;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

public final class MeritzListener extends NotificationListenerService {
    private final ExecutorService queue = Executors.newSingleThreadExecutor();
    @Override public void onNotificationPosted(StatusBarNotification sbn) {
        var prefs = JournalStore.prefs(this);
        if(!prefs.getBoolean("enabled",false) || !sbn.getPackageName().equals(prefs.getString("package",""))) return;
        Notification n = sbn.getNotification();
        if((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle e = n.extras;
        String title = String.valueOf(e.getCharSequence(Notification.EXTRA_TITLE,""));
        String text = String.valueOf(e.getCharSequence(Notification.EXTRA_BIG_TEXT,e.getCharSequence(Notification.EXTRA_TEXT,"")));
        CharSequence[] lines = e.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if(lines != null && text.trim().isEmpty()) text = String.join("\n", lines);
        String combined = title + "\n" + text;
        if(!combined.contains("체결") && !combined.contains("매수") && !combined.contains("매도")) return;
        final String body = text;
        queue.execute(() -> {
            try(JournalStore store = new JournalStore(this)) {
                store.add(sbn.getKey(),sbn.getPostTime(),sbn.getPackageName(),title,body);
                Uploader.request(getApplicationContext());
            } catch(Exception ignored) { JournalStore.prefs(this).edit().putString("status","알림 저장을 확인해 주세요").apply(); }
        });
    }
    @Override public void onListenerConnected() { SyncJob.schedule(this); }
    @Override public void onDestroy() { queue.shutdown(); super.onDestroy(); }
}
