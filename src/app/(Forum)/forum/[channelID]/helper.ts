import { store } from "@/redux/store";
import {
  setError,
  setIsOpen,
  setPostContentInput,
  setPostID,
  setPostTitleInput,
} from "@/redux/slices/forumSlice";
import { Category, Post } from "@/utils/Types";
import { mutate } from "swr";
import { signOut } from "next-auth/react";

const apiURL = process.env.NEXT_PUBLIC_API_URL;
const dispatch = store.dispatch;

const getChannelID = () => store.getState().channel.channelID;
const getPostsURL = () => `/uhelp-api/channel/${getChannelID()}/posts`;
let access_token: string;
let tokenFetched = false;

const getAuthHeader = async () => {
  if (!tokenFetched) {
    const res = await fetch("/api/auth/session", { cache: "force-cache" });
    const data = await res.json();
    tokenFetched = true;
    access_token = data.user.access_token;
  }

  if (access_token) {
    return {
      "Content-Type": "application/json",
      Authorization: "Bearer " + access_token,
    };
  }
};
export const postsFetcher = async () => {
  const res = await fetch(getPostsURL(), {
    method: "GET",
    headers: await getAuthHeader(),
  });
  const data = await res.json();

  if (res.status === 401) {
    signOut();
    window.location.href = "/signin";
    return [];
  }
  if (data.error) return [];

  return data;
};

const handleResponse = (data: any, setError: Function) =>
  data.error ? setError(data.error) : mutate(getPostsURL());

const checkInput = (title: string, content: string) =>
  title === ""
    ? "Title cannot be empty"
    : content === ""
    ? "Content cannot be empty"
    : null;

export const formatTime = (date: string, full: boolean) => {
  const postedDate = new Date(date);
  const localOffset = new Date().getTimezoneOffset();
  const localTime = new Date(postedDate.getTime() - localOffset * 60 * 1000);

  if (full)
    return localTime.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });

  const now = new Date();
  const diffInMs = Math.abs(now.getTime() - localTime.getTime());
  const diffInSeconds = Math.round(diffInMs / 1000);
  const diffInMinutes = Math.round(diffInSeconds / 60);
  const diffInHours = Math.round(diffInMinutes / 60);
  const diffInDays = Math.round(diffInHours / 24);
  const diffInMonths = Math.round(diffInDays / 30);
  const diffInYears = Math.round(diffInMonths / 12);

  const timeFormat =
    diffInSeconds < 60
      ? diffInSeconds + "s"
      : diffInMinutes < 60
      ? diffInMinutes + "m"
      : diffInHours < 24
      ? diffInHours + "h"
      : diffInDays < 30
      ? diffInDays + "d"
      : diffInMonths < 12
      ? diffInMonths + "mo"
      : diffInYears + "y";

  return timeFormat + " ago";
};

export const addPost = async () => {
  const postTitleInput = store.getState().forum.postTitleInput;
  const postContentInput = store.getState().forum.postContentInput;

  const error = checkInput(postTitleInput, postContentInput);
  if (error) {
    dispatch(setError(error));
    return;
  }

  fetch(`${apiURL}/post/new`, {
    method: "POST",
    headers: await getAuthHeader(),
    body: JSON.stringify({
      title: postTitleInput,
      content: postContentInput,
      channel_id: getChannelID(),
    }),
  })
    .then((res) => res.json())
    .then(({ error }) => {
      handleResponse({ error }, setError);
      dispatch(setIsOpen(false));
      dispatch(setPostTitleInput(""));
      dispatch(setPostContentInput(""));
    })
    .catch(console.error);
};

export const addReply = async (id: number, parent_id: number | null) => {
  const postContentInput = store.getState().forum.postContentInput;
  if (postContentInput === "") {
    dispatch(setError("Reply cannot be empty"));
    return;
  }

  fetch(`/uhelp-api/reply/${id}`, {
    method: "POST",
    headers: await getAuthHeader(),
    body: JSON.stringify({
      content: postContentInput,
      post_id: id,
      parent_reply_id: parent_id,
    }),
  })
    .then((res) => res.json())
    .then(({ error }) => {
      handleResponse({ error }, setError);
      dispatch(setIsOpen(false));
      dispatch(setPostContentInput(""));
    })
    .catch(console.error);
};

export const editPost = async (id: number) => {
  const postTitleInput = store.getState().forum.postTitleInput;
  const postContentInput = store.getState().forum.postContentInput;

  const error = checkInput(postTitleInput, postContentInput);
  if (error) {
    dispatch(setError(error));
    return;
  }

  fetch(`/uhelp-api/edit/post/${id}`, {
    method: "POST",
    headers: await getAuthHeader(),
    body: JSON.stringify({
      title: postTitleInput,
      content: postContentInput,
    }),
  })
    .then((res) => res.json())
    .then(({ error }) => {
      handleResponse({ error }, setError);
      dispatch(setIsOpen(false));
      dispatch(setPostID(0));
      dispatch(setPostTitleInput(""));
      dispatch(setPostContentInput(""));
    })
    .catch(console.error);
};

export const editReply = async (id: number | null) => {
  const postContentInput = store.getState().forum.postContentInput;

  if (postContentInput === "") {
    setError("Reply cannot be empty");
    return;
  }

  fetch(`/uhelp-api/edit/reply/${id}`, {
    method: "POST",
    headers: await getAuthHeader(),
    body: JSON.stringify({
      content: postContentInput,
    }),
  })
    .then((res) => res.json())
    .then(({ error }) => {
      handleResponse({ error }, setError);
      dispatch(setIsOpen(false));
      dispatch(setPostContentInput(""));
    })
    .catch(console.error);
};

export const deletePost = async (id: number) => {
  fetch(`/uhelp-api/delete/post/${id}`, {
    method: "POST",
    headers: await getAuthHeader(),
  })
    .then(() => {
      dispatch(setIsOpen(false));
      mutate(postsFetcher);
    })
    .catch(console.error);
};

export const deleteReply = async (id: number | null) => {
  fetch(`/uhelp-api/delete/reply/${id}`, {
    method: "POST",
    headers: await getAuthHeader(),
  })
    .then(() => {
      dispatch(setIsOpen(false));
      mutate(postsFetcher);
    })
    .catch(console.error);
};

export const like = async (
  id: number,
  isReply: boolean,
  depth: number = 0,
  posts: Post[] | undefined
) => {
  const updateLikes = (data: Post[] | undefined, depth: number): Post[] => {
    if (data && depth === 0) {
      return data.map((post: Post) =>
        post.id === id
          ? {
              ...post,
              liked: !post.liked,
              likes: post.liked ? post.likes - 1 : post.likes + 1,
            }
          : post
      );
    } else {
      if (!data) return [];
      return data.map((post: any) =>
        post.replies
          ? { ...post, replies: updateLikes(post.replies, depth - 1) }
          : post
      );
    }
  };

  const updatedPosts = isReply
    ? updateLikes(posts, depth + 1)
    : updateLikes(posts, 0);

  const updatedPostsFetcher = async (): Promise<Post[]> => {
    const res = await fetch(
      `/uhelp-api/like/${isReply ? "reply" : "post"}/${id}`,
      {
        method: "GET",
        headers: await getAuthHeader(),
      }
    );
    const data = await res.json();
    return data;
  };

  mutate(getPostsURL(), updatedPostsFetcher(), {
    optimisticData: updatedPosts,
    rollbackOnError: true,
    populateCache: true,
    revalidate: false,
  });
};

export const categoriesFetcher = async (url: string): Promise<Category[]> =>
  fetch(url, {
    method: "GET",
    headers: await getAuthHeader(),
  })
    .then((res) => res.json())
    .then((data) => {
      return data.categories;
    });

export const channelFetcher = async (url: string): Promise<any> =>
  fetch(url, {
    method: "GET",
    headers: await getAuthHeader(),
  })
    .then((res) => res.json())
    .then((data) => {
      return data;
    });
