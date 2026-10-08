export default function Help() {
  return (
    <div className="max-w-3xl space-y-6 text-sm leading-relaxed">
      <h1>Bantuan</h1>

      <section className="card space-y-2">
        <h2>Cara kerja</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <b>API key</b>: tempel key Gemini, OpenAI, Claude, atau penyedia OpenAI-compatible (misal OpenRouter). Aplikasi membaca daftar model akun Anda, memilih
            model stabil terbaru, dan otomatis pindah ke model pengganti bila model lama dihentikan penyedia.
          </li>
          <li>
            <b>Buat Soal</b>: pilih paket (misalnya Latihan Singkat atau SKD Lengkap) dan tingkat kesulitan, lalu klik Buat Soal. Topik dan jumlah soal bisa
            diatur di "Sesuaikan lebih lanjut".
          </li>
          <li>
            <b>Tinjau</b>: tab Soal, Kunci & Skor, Pembahasan. Soal bertanda "perlu dicek" sebaiknya diperiksa. Tiap soal bisa diedit, ditulis ulang, dikunci,
            dibintangi, dipindah, dihapus, atau dijadikan dasar "Serupa+".
          </li>
          <li>
            <b>Simulasi CAT</b>: timer, grid nomor, ragu-ragu, kirim otomatis. Laporan menampilkan skor per sub-tes terhadap ambang batas dan topik lemah.
          </li>
          <li>
            <b>Mode Latihan</b>: di halaman Latihan Ujian pilih "Latihan". Kunci dan pembahasan tampil langsung setelah menjawab, jawaban tidak bisa diubah,
            dan Anda bisa memilih topik tertentu. Hasil latihan tidak masuk grafik skor ujian di Progres. Dari Laporan Skor, klik "Latih ulang topik ini".
          </li>
          <li>
            <b>Rencana belajar</b>: di Pengaturan, isi waktu belajar per hari dan, bila sudah ada, tanggal ujian. Beranda lalu menampilkan hitung mundur,
            target hari ini, dan kesiapan Anda dibanding skor target. Jadwal simulasi mingguan bisa diunduh ke kalender (.ics).
          </li>
          <li>
            <b>Buku Kesalahan</b>: soal yang salah, kosong, atau ditandai ragu-ragu masuk otomatis. Setiap hari buka "Ulangan hari ini", jawab soalnya, lihat
            pembahasan, lalu nilai seberapa ingat Anda (Lupa, Sulit, Baik, Mudah). Soal yang mudah diingat makin jarang muncul; yang terlupa muncul lagi
            besok. Batas ulangan per hari bisa diubah di Pengaturan.
          </li>
          <li>
            <b>Bank Soal</b>: semua soal tersimpan dan bisa dipakai ulang untuk set baru tanpa AI. Centang soal lalu klik Unduh untuk mendapatkan file
            PDF/Word.
          </li>
          <li>
            <b>Unduh PDF / Word</b>: di halaman set atau Bank Soal, klik Unduh, pilih format (PDF atau Word) dan isinya (soal saja, soal + kunci, atau
            lengkap dengan pembahasan).
          </li>
        </ol>
      </section>

      <section className="card space-y-2">
        <h2>Pemeriksaan keandalan</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>TIU numerik</b>: AI menyertakan ekspresi hitung yang dihitung ulang dengan mathjs. Bila kunci keliru tetapi tepat satu opsi cocok, kunci dikoreksi
            otomatis dan ditandai. Bila tidak ada yang cocok, soal ditandai.
          </li>
          <li>
            <b>TIU figural</b>: deret dan analogi gambar dibuat oleh aplikasi sendiri dari aturan pasti (rotasi, jumlah, arsiran, bentuk), jadi kuncinya selalu benar
            dan gratis.
          </li>
          <li>
            <b>TKP</b>: setiap opsi wajib berskor 1–5, tidak boleh ada dua opsi berbagi skor tertinggi.
          </li>
          <li>
            <b>TWK</b>: setiap soal harus memiliki rujukan (sila, pasal UUD, fakta sejarah). Soal tanpa rujukan atau yang ditandai AI "kurang yakin" diberi tanda untuk
            dicek ke sumber resmi.
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
        <h2>Data & privasi</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Tidak ada server dan tidak ada login. Set, bank soal, riwayat, dan key hanya tersimpan di browser ini (IndexedDB).</li>
          <li>Teks soal yang Anda minta dikirim langsung ke penyedia AI pilihan Anda dan tunduk pada kebijakan privasi penyedia tersebut.</li>
          <li>
            Data browser bisa terhapus bila Anda membersihkan data situs. Unduh cadangan di Pengaturan; Beranda mengingatkan bila cadangan sudah lebih dari 7
            hari atau ada 3 set baru. Di Chrome/Edge desktop, pilih "Simpan otomatis ke berkas" agar cadangan diperbarui sendiri setiap ada perubahan.
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
            <b>Respons terpotong / JSON tidak valid</b>: soal yang lengkap tetap disimpan dan sisanya diminta ulang otomatis. Bila sering terjadi, kecilkan
            "soal per request" di Pengaturan.
          </li>
          <li>
            <b>Kuota free tier habis</b>: atur batas kuota key di halaman API Key → Lainnya (preset "Gemini free tier"). Aplikasi menunggu sendiri saat batas per
            menit tercapai dan berhenti saat kuota harian habis; buka set lalu klik Lanjutkan setelah kuota direset. Soal dari bank soal dan soal figural tidak
            memakai kuota.
          </li>
        </ul>
      </section>
    </div>
  );
}
