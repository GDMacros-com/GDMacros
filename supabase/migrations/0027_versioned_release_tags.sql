begin;

alter table private.submission_publish_state
  drop constraint publish_tag_shape,
  add constraint publish_tag_shape check (
    release_tag is null or release_tag ~ '^level-(2[.]2091-)?[0-9]{1,12}$'
  );

commit;
