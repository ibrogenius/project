<script>
  let quotes = [
    "BLACKS ARE CRYING",
    "BLACK LIVES MATTERS",
    "STOP RAPING OUR WOMEN",
    "WE ARE IMPORTANT",
    "STOP RACISM",
    "STOP TRIBALISM",
    "STOP DISCRIMINATING"
  ];
  let random;
  function quote() {
    random = Math.floor(Math.random() * quotes.length);
    document.getElementById("johnny").innerHTML = quotes[random];
  }
</script>

<style>
  .blm {
    border: none;
    color: #fff;
    padding: 15px 32px;
    text-align: center;
    text-decoration: none;
    display: inline-block;
    font-size: 16px;
    outline: none;
    flex: 1;
    cursor: pointer;
    background-color: rgb(223, 20, 20);
  }
  .blm:hover {
    background-color: chartreuse;
    color: #000;
  }
</style>

<div bp="grid">
  <main bp="offset-5@md 4@md 12@sm">
    <p class="pa" id="johnny">...</p>
  </main>
</div>

<div bp="grid">
  <button bp="offset-5@md 4@md 12@sm" class="blm" on:click={quote}>
    Black Lives Matter
  </button>
</div>
