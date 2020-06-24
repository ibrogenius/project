<script>
  import Timer from "./Timer.svelte";
  import HowTo from "./HowTo.svelte";
  import Quote from "./Quote.svelte";
</script>

<style>
  h1,
  h3 {
    text-align: center;
  }
  small {
    font-family: fantasy;
    font-size: 10px;
  }
  a {
    text-decoration: none;
  }
</style>

<h1>
  Inu John
  <small>
    <a href="https://blacklivesmatter.com/">BLACK LIVES MATTER</a>
  </small>
</h1>

<Timer />

<HowTo />

<h3 class="svelte">
  <a href="https://www.who.int/gpsc/clean_hands_protection/en/">Picture Link</a>
  <a href="https://freesound.org/people/metrostock99/sounds/345086">
    Sound Link
  </a>
</h3>

<Quote />
