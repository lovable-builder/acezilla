-- The country a workspace sells in. Used to search the public ad libraries for the right market (competitor ads).
alter table workspace add column country text not null default 'PL';
