/* fetch('https://www.reddit.com/r/aww.json?limit=100&?sort=top&t=all')
  .then((res) => res.json())
  .then((res) => res.data.children)
  .then((res) =>
    res.map((post) => ({
      author: post.data.author,
      link: post.data.url,
      img:
        typeof post.data.preview !== 'undefined'
          ? post.data.preview.images[0].source.url
          : null,
      title: post.data.title,
    }))
  )
  .then((res) => res.map(render))
  .then((res) => console.log(res));

const render = (post) => {
  const node = document.createElement('div');
  node.innerHTML = `
        <a href="${post.link}">
          <img src="${post.img}"/>
        </a>`;
  document.getElementById('app').appendChild(node);
  return post;
};

function postRandomCutie(urls) {
  const randomURL = urls[Math.floor(Math.random() * urls.length) + 1];
  /* const embed = new Discord.RichEmbed({
    image: {
      url: randomURL,
    },
  }); 
  console.log(randomURL);
} */

function getCuteAnimals() {
  fetch('https://www.reddit.com/r/aww.json?limit=100&?sort=top&t=all')
    .then((res) => res.json())
    .then((res) => res.data.children)
    .then((res) =>
      res.map((post) => ({
        author: post.data.author,
        link: post.data.url,
        img:
          typeof post.data.preview !== 'undefined'
            ? post.data.preview.images[0].source.url
            : null,
        title: post.data.title,
      }))
    )
    .then((res) => getRandomPost(res));
}

function getRandomPost(posts) {
  const randomURL = posts[Math.floor(Math.random() * posts.length) + 1];

  /* const embed = new Discord.RichEmbed({
    image: {
      url: randomURL,
    },
  }); */

  const embed = randomURL.img;
  const node = document.createElement('div');
  node.innerHTML = `
       
          <img src="${embed}"/>`;

  document.getElementById('app').appendChild(node);
  console.log(embed);
}

getCuteAnimals();
