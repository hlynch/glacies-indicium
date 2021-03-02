import praw

reddit = praw.Reddit(client_id='web:Vc-UiDo49M50wA', client_secret='ETKol-RYt4fjG3LRQgDAT42oQ_2-mg',
                     user_agent='web:Vc-UiDo49M50wA:v1.2.3 (by u/wackoZacko1234)')
page = reddit.subreddit('aww')
top_posts = page.hot(limit=None)

for post in top_posts:
    print(post)
