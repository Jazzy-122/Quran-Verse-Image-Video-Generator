const BACKEND_URL = "https://YOUR-RENDER-APP.onrender.com";

async function uploadVideo() {
  const input = document.getElementById("videoInput");
  const status = document.getElementById("status");
  const download = document.getElementById("download");

  download.style.display = "none";
  status.innerText = "";

  if (!input || !input.files || !input.files[0]) {
    alert("Please select a video first");
    return;
  }

  try {
    status.innerText = "Converting video, please wait...";

    const formData = new FormData();
    formData.append("video", input.files[0]);

    const response = await fetch(`${BACKEND_URL}/convert`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error("Backend conversion failed");
    }

    const blob = await response.blob();

    if (!blob || blob.size === 0) {
      throw new Error("Empty video received");
    }

    const url = URL.createObjectURL(blob);

    download.href = url;
    download.download = "quran-video.mp4";
    download.innerText = "Download WhatsApp MP4";
    download.style.display = "inline-block";

    status.innerText = "Video ready ✔";
  } catch (err) {
    console.error(err);
    status.innerText = "Error: video conversion failed";
  }
}
