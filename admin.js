(() => {
  const $ = id => document.getElementById(id);
  const cfg = window.MV_CONFIG || {};
  const owner = $("owner"), repo = $("repo"), branch = $("branch"), token = $("token");
  owner.value = cfg.owner && !cfg.owner.startsWith("YOUR_") ? cfg.owner : "";
  repo.value = cfg.repo && !cfg.repo.startsWith("YOUR_") ? cfg.repo : "";
  branch.value = cfg.branch || "main";
  let connected = false;

  const api = (path) => `https://api.github.com/repos/${encodeURIComponent(owner.value.trim())}/${encodeURIComponent(repo.value.trim())}/contents/${path}`;
  const headers = () => ({
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${token.value.trim()}`,
    "X-GitHub-Api-Version": "2022-11-28"
  });
  function setStatus(message, good=false) {
    $("connection-status").textContent = message;
    $("connection-status").className = "status " + (good ? "good" : "bad");
  }
  function slugify(s) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g,"d").replace(/Đ/g,"D")
      .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,55) || "thu-moi";
  }
  function safeFileName(name) {
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]/g,"-").slice(-90);
  }
  async function githubRequest(url, options={}) {
    const res = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.message || `GitHub API lỗi ${res.status}`);
    return data;
  }
  async function checkConnection() {
    if (!owner.value.trim() || !repo.value.trim() || !token.value.trim()) throw new Error("Nhập username, repository và token.");
    const data = await githubRequest(`https://api.github.com/repos/${encodeURIComponent(owner.value.trim())}/${encodeURIComponent(repo.value.trim())}`);
    if (!data.permissions || !data.permissions.push) {
      throw new Error("Token chưa có quyền ghi (Contents: Read and write) vào repository này.");
    }
    connected = true;
    setStatus(`Đã kết nối: ${data.full_name}`, true);
    return data;
  }
  $("connect").addEventListener("click", async () => {
    setStatus("Đang kiểm tra...");
    try { await checkConnection(); } catch(e) { connected=false; setStatus(e.message); }
  });
  $("pdf").addEventListener("change", () => $("pdf-name").textContent = $("pdf").files[0]?.name || "Chưa chọn file");
  $("audio").addEventListener("change", () => $("audio-name").textContent = $("audio").files[0]?.name || "Chưa chọn file");

  async function putFile(path, file, message) {
    const content = await new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return githubRequest(api(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, content, branch: branch.value.trim() || "main" })
    });
  }
  function publicBase() {
    const path = location.pathname.replace(/\/admin\.html$/,"").replace(/\/$/,"");
    return location.origin + path;
  }
  $("invite-form").addEventListener("submit", async e => {
    e.preventDefault();
    const pdf = $("pdf").files[0], audio = $("audio").files[0];
    if (!pdf || pdf.type !== "application/pdf") return alert("Vui lòng chọn file PDF hợp lệ.");
    if (pdf.size > 20*1024*1024) return alert("PDF vượt 20 MB. Hãy nén PDF trước khi tải lên.");
    if (audio && audio.size > 10*1024*1024) return alert("Nhạc nền vượt 10 MB. Hãy nén file âm thanh trước.");
    if (!token.value.trim()) return alert("Hãy nhập GitHub Token trước khi xuất bản.");
    const title = $("title").value.trim();
    const slug = `${slugify(title)}-${Math.random().toString(36).slice(2,7)}`;
    const folder = `invitations/${slug}`;
    const btn = $("publish");
    btn.disabled = true; btn.textContent = "Đang xuất bản...";
    $("progress-wrap").hidden = false;
    const updateProgress = (pct, label) => { $("progress").style.width = pct+"%"; $("progress-label").textContent = label; };
    try {
      await checkConnection();
      const pdfName = safeFileName(pdf.name) || "invitation.pdf";
      updateProgress(10, "Đang tải PDF lên GitHub...");
      await putFile(`${folder}/${pdfName}`, pdf, `Add invitation PDF: ${title}`);
      let audioPath = null;
      if (audio) {
        updateProgress(55, "Đang tải nhạc nền...");
        const audioName = safeFileName(audio.name) || "background.mp3";
        await putFile(`${folder}/${audioName}`, audio, `Add invitation audio: ${title}`);
        audioPath = `${folder}/${audioName}`;
      }
      const meta = {
        title,
        date: $("date").value.trim(),
        venue: $("venue").value.trim(),
        description: $("description").value.trim(),
        pdf: `${folder}/${pdfName}`,
        audio: audioPath,
        slug
      };
      updateProgress(80, "Đang tạo thông tin thư mời...");
      const jsonFile = new File([JSON.stringify(meta,null,2)], "invitation.json", {type:"application/json"});
      await putFile(`${folder}/invitation.json`, jsonFile, `Publish invitation: ${title}`);
      updateProgress(100, "Đã xuất bản lên GitHub. Pages có thể cập nhật trong 1–3 phút.");
      const url = `${publicBase()}/invite.html?id=${encodeURIComponent(slug)}`;
      $("result").hidden = false;
      $("result").innerHTML = `<b>Đã tạo thư mời!</b><a href="${url}" target="_blank" rel="noopener">${url}</a><button type="button" id="copy-link" class="button secondary">Sao chép đường link</button>`;
      $("copy-link").addEventListener("click", async () => { await navigator.clipboard.writeText(url); $("copy-link").textContent="Đã sao chép ✓"; });
      await loadInvitations();
    } catch(err) {
      updateProgress(0, "Có lỗi: "+err.message);
      alert("Không thể xuất bản: "+err.message);
    } finally {
      btn.disabled=false; btn.textContent="Xuất bản thư mời";
    }
  });

  async function loadInvitations() {
    const listing = $("invitation-list");
    listing.innerHTML = "<p class='muted'>Đang tải...</p>";
    try {
      const data = await githubRequest(api("invitations?ref="+encodeURIComponent(branch.value.trim() || "main")));
      const dirs = data.filter(x=>x.type==="dir");
      if (!dirs.length) { listing.innerHTML="<p class='muted'>Chưa có thư mời nào.</p>"; return; }
      listing.innerHTML = "";
      for (const dir of dirs) {
        const metaUrl = api(`${dir.path}/invitation.json?ref=${encodeURIComponent(branch.value.trim() || "main")}`);
        try {
          const meta = await githubRequest(metaUrl);
          const decoded = JSON.parse(decodeURIComponent(escape(atob(meta.content.replace(/\n/g,"")))));
          const url = `${publicBase()}/invite.html?id=${encodeURIComponent(dir.name)}`;
          const row=document.createElement("div"); row.className="list-row";
          const title=document.createElement("b"); title.textContent=decoded.title || dir.name;
          const link=document.createElement("a"); link.href=url; link.target="_blank"; link.rel="noopener"; link.textContent=url;
          const copy=document.createElement("button"); copy.className="copy"; copy.textContent="Sao chép"; copy.addEventListener("click",async()=>{await navigator.clipboard.writeText(url);copy.textContent="Đã sao chép";});
          row.append(title,link,copy); listing.append(row);
        } catch {}
      }
      if (!listing.children.length) listing.innerHTML="<p class='muted'>Chưa có thư mời đã xuất bản.</p>";
    } catch(err) { listing.innerHTML=`<p class="error-text">${err.message}. Kiểm tra thư mục invitations/ và quyền token.</p>`; }
  }
  $("refresh").addEventListener("click", async()=>{try{await checkConnection();await loadInvitations();}catch(e){setStatus(e.message);}});
})();