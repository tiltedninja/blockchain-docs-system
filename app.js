// Toggle User Menu
const userBtn = document.getElementById("userBtn");
const dropdown = document.querySelector(".user-menu .dropdown");
userBtn.addEventListener("click", () => {
  const isHidden = dropdown.getAttribute("aria-hidden") === "true";
  dropdown.setAttribute("aria-hidden", !isHidden);
});

// Logout function
function logout() {
  alert("You have been logged out!");
}

// Digital Signature generation
const generateSigBtn = document.getElementById("generateSig");
const txSignature = document.getElementById("txSignature");

generateSigBtn.addEventListener("click", async () => {
  const content = "Sample document content";
  const encoder = new TextEncoder();
  const data = encoder.encode(content);

  // Generate SHA-256 hash as digital signature
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const signature = hashArray.map(b => b.toString(16).padStart(2,'0')).join('');

  txSignature.innerHTML = `Digital Signature: <span>${signature}</span>`;
  alert("Digital Signature Generated!");
});