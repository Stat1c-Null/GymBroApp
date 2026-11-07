package com.gymbro.backend.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.gymbro.backend.dto.FriendRequestPayload;
import com.gymbro.backend.dto.FriendsResponse;
import com.gymbro.backend.dto.FriendshipResponse;
import com.gymbro.backend.dto.ProfileResponse;
import com.gymbro.backend.security.AuthenticatedUser;
import com.gymbro.backend.service.FriendService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1")
public class FriendController {

    private final FriendService friendService;

    public FriendController(FriendService friendService) {
        this.friendService = friendService;
    }

    /** People directory: empty {@code q} browses, otherwise a username/name prefix search. */
    @GetMapping("/users/search")
    public List<ProfileResponse> search(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(name = "q", required = false) String query,
            @RequestParam(required = false) Integer limit) {
        return friendService.search(user.id(), query, limit);
    }

    @GetMapping("/friends")
    public FriendsResponse list(@AuthenticationPrincipal AuthenticatedUser user) {
        return friendService.list(user.id());
    }

    @PostMapping("/friends/requests")
    @ResponseStatus(HttpStatus.CREATED)
    public FriendshipResponse sendRequest(@AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody FriendRequestPayload payload) {
        return friendService.sendRequest(user.id(), payload.userId());
    }

    @PostMapping("/friends/requests/{id}/accept")
    public FriendshipResponse accept(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id) {
        return friendService.accept(user.id(), id);
    }

    @PostMapping("/friends/requests/{id}/decline")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void decline(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) {
        friendService.decline(user.id(), id);
    }

    @DeleteMapping("/friends/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) {
        friendService.remove(user.id(), id);
    }
}
