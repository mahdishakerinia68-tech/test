package com.sandoogh.man;
import android.app.*; import android.os.*; import android.content.*; import android.graphics.Color; import android.view.*; import android.widget.*; import java.util.*;
public class MainActivity extends Activity {
 int count=0, due=0;
 android.content.SharedPreferences p;
 @Override public void onCreate(Bundle b){super.onCreate(b); setContentView(R.layout.activity_main); p=getSharedPreferences("vault",0); count=p.getInt("count",0); due=p.getInt("due",0); refresh();
 findViewById(R.id.addBtn).setOnClickListener(v->addItem());
 findViewById(R.id.privateBtn).setOnClickListener(v->privateBox());
 }
 void refresh(){((TextView)findViewById(R.id.count)).setText(toFa(count)+"\nمورد ذخیره‌شده");((TextView)findViewById(R.id.due)).setText(toFa(due)+"\nهشدار نزدیک");}
 void addItem(){ final EditText e=new EditText(this); e.setHint("عنوان مدرک / فاکتور / گارانتی"); new AlertDialog.Builder(this).setTitle("ذخیره سریع").setView(e).setPositiveButton("ذخیره",(d,w)->{if(e.getText().length()>0){count++;p.edit().putInt("count",count).apply();refresh();Toast.makeText(this,"در صندوق ذخیره شد",Toast.LENGTH_SHORT).show();}}).setNegativeButton("انصراف",null).show();}
 void privateBox(){ final EditText e=new EditText(this);e.setInputType(2);e.setHint("PIN");new AlertDialog.Builder(this).setTitle("🔒 صندوق خصوصی").setMessage("برای نسخه اول، PIN را وارد کنید.").setView(e).setPositiveButton("باز کردن",(d,w)->Toast.makeText(this,"صندوق خصوصی باز شد",Toast.LENGTH_SHORT).show()).setNegativeButton("انصراف",null).show();}
 String toFa(int n){return String.valueOf(n).replace("0","۰").replace("1","۱").replace("2","۲").replace("3","۳").replace("4","۴").replace("5","۵").replace("6","۶").replace("7","۷").replace("8","۸").replace("9","۹");}
}