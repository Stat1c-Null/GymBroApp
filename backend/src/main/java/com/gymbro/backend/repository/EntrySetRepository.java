package com.gymbro.backend.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.gymbro.backend.model.EntrySet;

public interface EntrySetRepository extends JpaRepository<EntrySet, Long> {

    List<EntrySet> findByEntryIdOrderBySetIndexAsc(Long entryId);

    List<EntrySet> findByEntryIdInOrderByEntryIdAscSetIndexAsc(Collection<Long> entryIds);

    void deleteByEntryId(Long entryId);
}
