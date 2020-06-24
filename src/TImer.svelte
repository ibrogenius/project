<script>
  import ProgressBar from "./ProgressBar.svelte";

  const setseconds = 5;
  let secondsLeft = setseconds;
  let isRunning = false;
  $: progress = ((setseconds - secondsLeft) / setseconds) * 100;

  function startTimer() {
    isRunning = true;
    const timer = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft == 0) {
        clearInterval(timer);
        isRunning = false;
        secondsLeft = setseconds;
      }
    }, 1000);
  }
</script>

<div bp="grid">
  <h2 bp="offset-5@md 4@md 12@sm">Seconds Left: {secondsLeft}</h2>
</div>

<p class="skk">{progress}</p>
<ProgressBar {progress} />

<div bp="grid">
  <button
    bp="offset-5@md 4@md 12@sm"
    class="start"
    disabled={isRunning}
    on:click={startTimer}>
    Start
  </button>
</div>
