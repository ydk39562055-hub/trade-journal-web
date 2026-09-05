package com.yun.tradejournal;
import android.app.job.*;
import android.content.*;
public final class SyncJob extends JobService {
    static void schedule(Context c) {
        JobInfo job = new JobInfo.Builder(4106,new ComponentName(c,SyncJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15*60*1000L).build();
        c.getSystemService(JobScheduler.class).schedule(job);
    }
    public boolean onStartJob(JobParameters p) { Uploader.QUEUE.execute(() -> { boolean ok=Uploader.sync(this); jobFinished(p,!ok); }); return true; }
    public boolean onStopJob(JobParameters p) { return true; }
}
