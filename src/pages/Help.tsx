import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CHANGELOG } from '../data/changelog';

export default function Help() {
  const [params] = useSearchParams();
  const changes = useRef<HTMLElement>(null);
  // "Riwayat perubahan" links here from the dashboard card and Pengaturan.
  useEffect(() => {
    if (params.get('bagian') === 'perubahan') changes.current?.scrollIntoView({ block: 'start' });
  }, [params]);

  return (
    <div className="max-w-3xl space-y-6 text-sm leading-relaxed">
      <h1>Bantuan</h1>

      <section className="card space-y-2">
        <h2>Cara kerja</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <b>API key</b>: tempel key Gemini, OpenAI, Claude, atau penyedia OpenAI-compatible (misal OpenRouter). Aplikasi membaca daftar model akun Anda, memilih model stabil
            terbaru, dan otomatis pindah ke model pengganti bila model lama dihentikan penyedia.
          </li>
          <li>
            <b>Buat Soal</b>: pilih paket (misalnya Latihan Singkat atau SKD Lengkap) dan tingkat kesulitan, lalu klik Buat Soal. Topik dan jumlah soal bisa diatur di "Sesuaikan
            lebih lanjut".
          </li>
          <li>
            <b>Tinjau</b>: tab Soal, Kunci & Skor, Pembahasan. Soal bertanda "perlu dicek" sebaiknya diperiksa. Tiap soal bisa diedit, ditulis ulang, dikunci, dibintangi, dipindah,
            dihapus, atau dijadikan dasar "Serupa+".
          </li>
          <li>
            <b>Tanya AI</b>: tombol di kartu soal yang menampilkan pembahasan (Detail Set, Bank Soal, Latihan, Laporan Skor, Buku Kesalahan), tidak saat ujian. Tutor menjelaskan
            soal dengan cara lain, mengapa jawaban Anda salah, atau trik cepatnya, menjawab pertanyaan Anda sendiri, dan bisa membuat 2 soal serupa yang lebih mudah. Tutor
            menjelaskan dari kunci dan pembahasan yang ada dan berterus terang bila kuncinya tampak keliru. Jawabannya bisa disimpan sebagai catatan soal. Setiap pertanyaan memakai
            satu permintaan AI dengan key Anda.
          </li>
          <li>
            <b>Nilai atau laporkan soal</b>: beri bintang 1–5, atau laporkan soal yang kuncinya salah, ambigu, usang, atau salah ketik. Soal yang dilaporkan ditandai "perlu dicek"
            dan tidak diambil untuk set baru kecuali Anda memilihnya; laporan bisa ditarik kembali.
          </li>
          <li>
            <b>Simulasi CAT</b>: timer, grid nomor, ragu-ragu, kirim otomatis. Laporan menampilkan skor per sub-tes terhadap ambang batas dan topik lemah. Bila set yang sama sudah
            pernah diujikan, laporan membandingkannya dengan ujian sebelumnya: soal yang membaik, memburuk, dan tetap salah, lalu yang memburuk atau tetap salah bisa langsung
            dilatih ulang.
          </li>
          <li>
            <b>PPPK 2024 dan paket ujian lain</b>: di Buat Soal, pilih ujian "PPPK 2024" (bawaan, dari Keputusan MenPAN-RB Nomor 347 Tahun 2024: teknis, manajerial, sosial
            kultural, dan wawancara, tanpa ambang batas) lalu isi nama jabatan Anda untuk soal kompetensi teknis. Ujian lain bisa ditambahkan di Pengaturan → Paket ujian dengan
            mengimpor berkas paket. Angka di berkas paket harus dari dokumen resmi; paket tanpa rujukan dokumen resmi ditandai "bukan data resmi".
          </li>
          <li>
            <b>Mode CAT</b>: centang saat memulai ujian. Ujian dibuka layar penuh bila perangkat mendukung (tombol "Keluar layar penuh" selalu ada), dan setiap kali Anda
            meninggalkan tab ujian dicatat di Laporan Skor tanpa pengurangan nilai. Opsi "Kunci urutan sub-tes" melatih pembagian waktu (TWK → TIU → TKP tanpa kembali); ini bukan
            aturan resmi yang sudah kami pastikan.
          </li>
          <li>
            <b>Mode Latihan</b>: di halaman Latihan Ujian pilih "Latihan". Kunci dan pembahasan tampil langsung setelah menjawab, jawaban tidak bisa diubah, dan Anda bisa memilih
            topik tertentu. Hasil latihan tidak masuk grafik skor ujian di Progres. Dari Laporan Skor, klik "Latih ulang topik ini".
          </li>
          <li>
            <b>Rencana belajar</b>: di Pengaturan, isi waktu belajar per hari dan, bila sudah ada, tanggal ujian. Beranda lalu menampilkan hitung mundur, target hari ini, dan
            kesiapan Anda dibanding skor target. Jadwal simulasi mingguan bisa diunduh ke kalender (.ics). Di rencana ada juga pengingat harian lewat notifikasi browser; pengingat
            ini hanya bisa muncul saat aplikasi terbuka, jadi kalender (.ics) tetap cara yang paling andal.
          </li>
          <li>
            <b>Streak dan lencana</b>: Beranda menghitung hari berturut-turut Anda menyelesaikan latihan, ujian, atau ulangan Buku Kesalahan. Hari di luar hari belajar yang dipilih
            di rencana tidak memutus streak; saat sakit atau libur, tekan "Jeda streak". Semuanya bisa dimatikan di Pengaturan.
          </li>
          <li>
            <b>Buku Kesalahan</b>: soal yang salah, kosong, atau ditandai ragu-ragu masuk otomatis. Setiap hari buka "Ulangan hari ini", jawab soalnya, lihat pembahasan, lalu nilai
            seberapa ingat Anda (Lupa, Sulit, Baik, Mudah). Soal yang mudah diingat makin jarang muncul; yang terlupa muncul lagi besok. Batas ulangan per hari bisa diubah di
            Pengaturan.
          </li>
          <li>
            <b>Kartu Hafalan TWK</b>: Pancasila, Pembukaan, dan setiap ayat UUD 1945 sebagai kartu, dari teks resmi "UUD NRI Tahun 1945 Dalam Satu Naskah" (Sekretariat Jenderal
            MPR), bukan buatan AI. Ada juga dek Lembaga negara (MPR, DPR, DPD, BPK, MA, KY, MK) yang mengutip ayat UUD tentang tugas dan wewenangnya, dengan pasal di setiap kartu.
            Pilih bab atau lembaga yang ingin dihafal; kartu diulang terjadwal seperti Buku Kesalahan (paling banyak 20 kartu baru per hari). Rujukan soal TWK yang menyebut pasal
            UUD menautkan ke teks resmi pasal itu.
          </li>
          <li>
            <b>Kamus Rumus TIU</b>: rumus dan pola deret, persen, jarak-waktu-kecepatan, perbandingan, dan silogisme, masing-masing dengan contoh. Disusun manual dan bisa dicari;
            pembahasan soal TIU dengan topik yang cocok menautkan ke bagian kamusnya.
          </li>
          <li>
            <b>Bank Soal</b>: semua soal tersimpan dan bisa dipakai ulang untuk set baru tanpa AI. Centang soal lalu klik Unduh untuk mendapatkan file PDF/Word.
          </li>
          <li>
            <b>Impor dari foto/PDF</b>: di Bank Soal, klik "Impor dari foto/PDF", potret halaman soal atau pilih gambar/PDF. Setiap halaman dikirim sebagai satu request ke penyedia
            AI pada API key Anda (perkiraan biaya tampil sebelum mengirim). AI menyalin soal dan opsinya; kunci dan pembahasan diusulkan AI bila halaman tidak memuatnya. Tinjau dan
            perbaiki setiap soal di samping gambar aslinya sebelum menyimpan; soal tersimpan bertanda "perlu dicek". Soal yang memakai gambar (grafik, diagram) bisa diberi gambar:
            seret kotak di atas halaman aslinya (atau Tab ke "Area potong" lalu atur dengan tombol panah) dan tempelkan ke soalnya; soal yang pilihan jawabannya berupa gambar masih
            dilewati. Hanya untuk materi milik Anda sendiri atau yang lisensinya membolehkan disalin; soal hasil impor tidak ikut dibagikan kecuali Anda memilihnya.
          </li>
          <li>
            <b>Bagikan set</b>: di halaman set, klik Bagikan untuk mendapatkan berkas, tautan, atau kode QR. Penerima mengimpornya tanpa akun. API key, riwayat ujian, Buku
            Kesalahan, nilai, dan laporan tidak ikut; catatan dan soal hasil impor foto/PDF hanya ikut bila Anda memilihnya.
          </li>
          <li>
            <b>Profil kisi-kisi</b>: di Pengaturan, atur topik per sub-tes SKD (dengan bobot bila perlu), jumlah soal, durasi, dan ambang batas sebagai profil. Profil bisa diimpor
            dan diekspor, jadi bila kisi-kisi resmi berubah Anda tidak perlu menunggu aplikasi diperbarui. Profil bawaan "SKD Sekolah Kedinasan 2026" memakai topik, jumlah soal,
            durasi, dan ambang batas dari Keputusan MenPAN-RB Nomor 406 Tahun 2026; angka itu khusus Sekolah Kedinasan, bukan CPNS.
          </li>
          <li>
            <b>Unduh PDF / Word</b>: di halaman set atau Bank Soal, klik Unduh, pilih format (PDF atau Word) dan isinya (soal saja, soal + kunci, atau lengkap dengan pembahasan).
          </li>
        </ol>
      </section>

      <section className="card space-y-2">
        <h2>Pemeriksaan keandalan</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>TIU numerik</b>: AI menyertakan ekspresi hitung yang dihitung ulang dengan mathjs. Bila kunci keliru tetapi tepat satu opsi cocok, kunci dikoreksi otomatis dan
            ditandai. Bila tidak ada yang cocok, soal ditandai.
          </li>
          <li>
            <b>TIU figural</b>: deret dan analogi gambar dibuat oleh aplikasi sendiri dari aturan pasti (rotasi, jumlah, arsiran, bentuk), jadi kuncinya selalu benar dan gratis.
          </li>
          <li>
            <b>TIU analisis data</b>: tabel dan grafik dibuat aplikasi dari angka acak dengan konteks rekaan (bukan statistik sungguhan), dan kuncinya dihitung dari angka itu, jadi
            gratis dan selalu benar.
          </li>
          <li>
            <b>TKP</b>: setiap opsi wajib berskor 1–5, tidak boleh ada dua opsi berbagi skor tertinggi.
          </li>
          <li>
            <b>Pemeriksa silang (opsional, di Pengaturan)</b>: model AI lain menjawab soal tanpa melihat kunci. Bila berbeda, soal ditandai "perlu dicek" dengan alasannya. Dua
            model bisa sama-sama keliru, jadi ini menambah kepercayaan, bukan jaminan.
          </li>
          <li>
            <b>TWK</b>: setiap soal harus memiliki rujukan (sila, pasal UUD, fakta sejarah). Soal tanpa rujukan atau yang ditandai AI "kurang yakin" diberi tanda untuk dicek ke
            sumber resmi.
          </li>
        </ul>
      </section>

      <section className="card space-y-2">
        <h2>Penilaian</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>TWK & TIU: jawaban benar 5, salah atau kosong 0.</li>
          <li>TKP: setiap opsi bernilai 1–5, tidak ada jawaban "salah".</li>
          <li>Lulus bila setiap sub-tes mencapai ambang batasnya. Untuk set yang lebih pendek dari standar, ambang batas diskalakan proporsional.</li>
        </ul>
      </section>

      <section className="card space-y-2">
        <h2>Aksesibilitas</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Ujian, latihan, dan ulangan bisa dikerjakan hanya dengan keyboard: A–E memilih jawaban, ← → pindah soal, Tab ke tombol lain.</li>
          <li>Ukuran teks bisa diperbesar di Pengaturan → Tampilan (Besar atau Sangat besar).</li>
          <li>Bila "kurangi gerakan" aktif di sistem Anda, animasi dan transisi dimatikan.</li>
        </ul>
      </section>

      <section className="card space-y-2">
        <h2>Data & privasi</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Tidak ada server dan tidak ada login. Set, bank soal, riwayat, dan key hanya tersimpan di browser ini (IndexedDB).</li>
          <li>
            Teks soal yang Anda minta, dan gambar halaman yang Anda kirim saat impor dari foto/PDF, dikirim langsung ke penyedia AI pilihan Anda dan tunduk pada kebijakan privasi
            penyedia tersebut. Gambar halaman itu tidak disimpan. Riwayat, Buku Kesalahan, dan catatan Anda tidak pernah dikirim.
          </li>
          <li>
            Ekstensi browser yang diizinkan membaca halaman bisa melihat API key Anda, juga key yang hanya untuk sesi; aplikasi tidak bisa mendeteksinya. Pakai profil browser tanpa
            ekstensi yang tidak Anda percayai, dan batasi key di dasbor penyedia (misalnya batas pengeluaran, atau hanya untuk Gemini API). Panduan per penyedia ada di halaman API
            Key.
          </li>
          <li>
            Data browser bisa terhapus bila Anda membersihkan data situs. Unduh cadangan di Pengaturan; Beranda mengingatkan bila cadangan sudah lebih dari 7 hari atau ada 3 set
            baru. Di Chrome/Edge desktop, pilih "Simpan otomatis ke berkas" agar cadangan diperbarui sendiri setiap ada perubahan.
          </li>
          <li>Aplikasi bisa dipasang (Install / Add to Home Screen) dan set tersimpan serta simulasi bisa dipakai offline. Pembuatan soal baru butuh internet.</li>
        </ul>
      </section>

      <section className="card space-y-2 border-amber-300 dark:border-amber-800">
        <h2>Penting</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Aplikasi ini untuk latihan dan bukan produk resmi BKN.</li>
          <li>Konten TWK buatan AI bisa keliru. Periksa ke sumber resmi (teks UUD 1945, peraturan perundang-undangan, buku sejarah resmi).</li>
          <li>Skor TKP adalah rasional berbasis nilai pelayanan publik, bukan kunci resmi.</li>
          <li>Jumlah soal, waktu, dan ambang batas dapat berubah. Sesuaikan di Pengaturan sesuai pengumuman resmi terbaru.</li>
        </ul>
      </section>

      <section className="card space-y-2">
        <h2>Masalah umum</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>401/403</b>: key salah atau belum aktif. <b>429</b>: kuota habis atau terlalu cepat; kurangi "permintaan paralel" di Pengaturan.
          </li>
          <li>
            <b>Gagal menghubungi (CORS)</b>: beberapa endpoint OpenAI-compatible menolak akses dari browser. Gunakan penyedia yang mendukung CORS (misal OpenRouter).
          </li>
          <li>
            <b>Respons terpotong / JSON tidak valid</b>: soal yang lengkap tetap disimpan dan sisanya diminta ulang otomatis. Bila sering terjadi, kecilkan "soal per request" di
            Pengaturan.
          </li>
          <li>
            <b>Kuota free tier habis</b>: atur batas kuota key di halaman API Key → Lainnya (preset "Gemini free tier"). Aplikasi menunggu sendiri saat batas per menit tercapai dan
            berhenti saat kuota harian habis; buka set lalu klik Lanjutkan setelah kuota direset. Soal dari bank soal dan soal figural tidak memakai kuota.
          </li>
        </ul>
      </section>

      <section ref={changes} className="card space-y-3" aria-labelledby="riwayat-perubahan">
        <h2 id="riwayat-perubahan">Riwayat perubahan</h2>
        <p className="muted">Versi yang Anda pakai: {__APP_VERSION__}.</p>
        {CHANGELOG.map((r) => (
          <div key={r.version} className="space-y-1">
            <h3>
              Versi {r.version}{' '}
              <span className="muted text-xs font-normal">{new Date(`${r.date}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </h3>
            <ul className="list-disc space-y-1 pl-5">
              {r.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
